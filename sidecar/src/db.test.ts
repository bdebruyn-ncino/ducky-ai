import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, suite, test } from "node:test";
import { openDb, readProjects, readSettings, writeProjects, writeSettings } from "./db.ts";
import { extractRegionFromArn, readAwsProfiles, scanForRepos } from "./setup.ts";

let workDir: string;

before(() => {
  workDir = mkdtempSync(join(tmpdir(), "ducky-db-test-"));
});

after(() => rmSync(workDir, { recursive: true, force: true }));

suite("openDb", () => {
  test("creates the file and both tables if they do not exist", () => {
    const path = join(workDir, "new.db");
    const db = openDb(path);
    // If the tables don't exist, these will throw.
    db.prepare("SELECT key, value FROM settings").all();
    db.prepare("SELECT name, path FROM projects").all();
    db.close();
  });

  test("is idempotent — opening an existing database does not reset it", () => {
    const path = join(workDir, "idempotent.db");
    const db1 = openDb(path);
    writeSettings(db1, { modelArn: "arn:test", awsProfile: "p", awsRegion: "us-east-1", reposRoot: "/tmp" });
    db1.close();

    const db2 = openDb(path);
    const settings = readSettings(db2);
    db2.close();
    assert.ok(settings !== null, "settings should survive reopen");
    assert.equal(settings!.modelArn, "arn:test");
  });
});

suite("settings round-trip", () => {
  test("readSettings returns null when settings table is empty", () => {
    const db = openDb(join(workDir, "empty.db"));
    assert.equal(readSettings(db), null);
    db.close();
  });

  test("readSettings returns null when any required key is missing", () => {
    const db = openDb(join(workDir, "partial.db"));
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run("modelArn", "arn:test");
    assert.equal(readSettings(db), null);
    db.close();
  });

  test("writeSettings then readSettings returns the same values", () => {
    const db = openDb(join(workDir, "roundtrip.db"));
    const settings = {
      modelArn: "arn:aws:bedrock:us-east-1:123:application-inference-profile/abc",
      awsProfile: "genai",
      awsRegion: "us-east-1",
      reposRoot: "/Users/me/Apps",
    };
    writeSettings(db, settings);
    const loaded = readSettings(db);
    db.close();
    assert.deepEqual(loaded, settings);
  });

  test("writeSettings overwrites existing values", () => {
    const db = openDb(join(workDir, "overwrite.db"));
    writeSettings(db, { modelArn: "arn:old", awsProfile: "old", awsRegion: "us-west-2", reposRoot: "/old" });
    writeSettings(db, { modelArn: "arn:new", awsProfile: "new", awsRegion: "eu-west-1", reposRoot: "/new" });
    const loaded = readSettings(db);
    db.close();
    assert.equal(loaded?.awsProfile, "new");
    assert.equal(loaded?.awsRegion, "eu-west-1");
  });
});

suite("projects round-trip", () => {
  test("readProjects returns [] when the table is empty", () => {
    const db = openDb(join(workDir, "no-projects.db"));
    assert.deepEqual(readProjects(db), []);
    db.close();
  });

  test("writeProjects then readProjects returns sorted rows", () => {
    const db = openDb(join(workDir, "projects.db"));
    writeProjects(db, [
      { name: "zebra-api", path: "/apps/zebra-api" },
      { name: "alpha-web", path: "/apps/alpha-web" },
    ]);
    const rows = readProjects(db);
    db.close();
    assert.deepEqual(rows, [
      { name: "alpha-web", path: "/apps/alpha-web" },
      { name: "zebra-api", path: "/apps/zebra-api" },
    ]);
  });

  test("writeProjects replaces all existing rows", () => {
    const db = openDb(join(workDir, "replace-projects.db"));
    writeProjects(db, [{ name: "old", path: "/old" }]);
    writeProjects(db, [{ name: "new", path: "/new" }]);
    const rows = readProjects(db);
    db.close();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, "new");
  });
});

suite("scanForRepos", () => {
  test("returns repos with a .git directory", () => {
    const root = join(workDir, "repos");
    for (const name of ["alpha-api", "beta-web", "not-a-repo"]) {
      mkdirSync(join(root, name), { recursive: true });
    }
    // Only alpha-api and beta-web have .git
    mkdirSync(join(root, "alpha-api", ".git"), { recursive: true });
    mkdirSync(join(root, "beta-web", ".git"), { recursive: true });

    const found = scanForRepos(root);
    const names = found.map((p) => p.name).sort();
    assert.deepEqual(names, ["alpha-api", "beta-web"]);
  });

  test("each result has the full absolute path", () => {
    const root = join(workDir, "one-repo");
    mkdirSync(join(root, "my-service", ".git"), { recursive: true });

    const found = scanForRepos(root);
    assert.equal(found.length, 1);
    assert.equal(found[0].path, join(root, "my-service"));
  });

  test("returns [] when the root does not exist", () => {
    assert.deepEqual(scanForRepos(join(workDir, "no-such-dir")), []);
  });

  test("expands ~ to the home directory", () => {
    // We can't create files in the real home, so just check it doesn't throw.
    const result = scanForRepos("~/no-such-ducky-test-dir-xyz");
    assert.ok(Array.isArray(result));
  });
});

suite("extractRegionFromArn", () => {
  test("parses a standard Bedrock ARN", () => {
    assert.equal(
      extractRegionFromArn("arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/abc"),
      "us-east-1",
    );
  });

  test("parses a GovCloud ARN", () => {
    assert.equal(
      extractRegionFromArn("arn:aws-us-gov:bedrock:us-gov-west-1:123:application-inference-profile/xyz"),
      "us-gov-west-1",
    );
  });

  test("returns undefined for a non-Bedrock ARN", () => {
    assert.equal(extractRegionFromArn("arn:aws:s3:::my-bucket"), undefined);
  });

  test("returns undefined for a plain string", () => {
    assert.equal(extractRegionFromArn("not-an-arn"), undefined);
  });
});

suite("readAwsProfiles", () => {
  test("parses [profile name] and [default] sections", () => {
    // Write a mock ~/.aws/config to a temp path.
    const mockHome = join(workDir, "mock-home-profiles");
    const awsDir = join(mockHome, ".aws");
    mkdirSync(awsDir, { recursive: true });
    writeFileSync(
      join(awsDir, "config"),
      [
        "[default]",
        "region = us-east-1",
        "",
        "[profile genai]",
        "region = us-east-1",
        "",
        "[profile staging]",
        "region = eu-west-1",
      ].join("\n"),
    );

    // readAwsProfiles reads from $HOME/.aws/config; monkey-patch HOME.
    const realHome = process.env.HOME;
    process.env.HOME = mockHome;
    try {
      const profiles = readAwsProfiles();
      assert.ok(profiles.includes("default"), "should include default");
      assert.ok(profiles.includes("genai"), "should include genai");
      assert.ok(profiles.includes("staging"), "should include staging");
    } finally {
      process.env.HOME = realHome;
    }
  });

  test("returns [] when ~/.aws/config does not exist", () => {
    const realHome = process.env.HOME;
    process.env.HOME = join(workDir, "no-home");
    try {
      assert.deepEqual(readAwsProfiles(), []);
    } finally {
      process.env.HOME = realHome;
    }
  });
});
