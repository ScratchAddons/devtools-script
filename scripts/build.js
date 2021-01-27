import stream from "stream";
import {promisify} from "util";
import fs from "fs-extra";
import fetch from "node-fetch";
import {Octokit} from "@octokit/rest";
import {default as chalk} from "chalk";

const OWNER = "ScratchAddons";
const REPO = "ScratchAddons";

// SA path: DevTools path
const KNOWN_FILES = {
  "/libraries/autoescaper.js": "/libraries/autoescaper.js",
  "/libraries/intl-messageformat.umd.min.js": "/libraries/intl-messageformat.umd.min.js",
  "/libraries/l10n.js": "/libraries/l10n.js",
  "/content-scripts/inject/l10n.js": "/inject/l10n.js",
};
const RAW_PREFIX = `https://raw.githubusercontent.com/${OWNER}/${REPO}/master`;

const success = (...args) => console.log(chalk`{green SUCCESS}:`, ...args);
const pipeline = promisify(stream.pipeline);
const countSlashes = str => Array.from(str.matchAll("/")).length;

const octokit = new Octokit({
  auth: process.env.GH_TOKEN,
});

// Copy DevTools specific files
await fs.emptyDir("./tmp/");
await fs.copy("./src/", "./tmp/");
success("copied DevTools specific files");

// Create directories
await fs.mkdir("./tmp/_locales");
await fs.mkdir("./tmp/addon");
await fs.mkdir("./tmp/l10n");
await fs.mkdir("./tmp/libraries");
success("created directories");

// Download files from ScratchAddons/ScratchAddons
// Part 1: fixed path
await Promise.all(Object.keys(KNOWN_FILES).map(
  async saURL => {
    const resp = await fetch(`${RAW_PREFIX}${saURL}`);
    await pipeline(resp.body, fs.createWriteStream(`./tmp${KNOWN_FILES[saURL]}`));
  }
));
success("downloaded ScratchAddons files");

// Part 2: editor-devtools
// This requires tree to download recursively
const {data: allAddonsInfo} = await octokit.repos.getContent({
  owner: OWNER,
  repo: REPO,
  path: "addons"
});
const editorDevToolsSHA = allAddonsInfo.find(item => item.name === "editor-devtools").sha;
const editorDevToolsFiles = (await octokit.git.getTree({
  owner: OWNER,
  repo: REPO,
  tree_sha: editorDevToolsSHA,
  recursive: true
})).data.tree;
// Create directories first
const directories = editorDevToolsFiles.filter(
  item => item.type === "tree"
).sort(
  (a, b) => countSlashes(b.path) - countSlashes(a.path)
);
const files = editorDevToolsFiles.filter(
  item => item.type !== "tree"
);
for (const dir of directories) {
  await fs.ensureDir(`./tmp/addon/${dir.path}`);
}
success("created directories for DevTools addon");
// Download files
await Promise.all(files.map(async file => {
  const resp = await fetch(`${RAW_PREFIX}/addons/editor-devtools/${file.path}`);
  await pipeline(resp.body, fs.createWriteStream(`./tmp/addon/${file.path}`));
}));
success("downloaded files for DevTools addon");

// Download l10n
const {data: localeDirs} = await octokit.repos.getContent({
  owner: OWNER,
  repo: REPO,
  path: "addons-l10n"
});
const locales = localeDirs.filter(item => item.type === "dir").map(item => item.name);
const translations = {};
await Promise.all(locales.map(async locale => {
  const resp = await fetch(`${RAW_PREFIX}/addons-l10n/${locale}/editor-devtools.json`);
  if (!resp.ok) return;
  const l10njson = await resp.json();
  const extensionName = l10njson["editor-devtools/help-title"];
  const extensionDescription = l10njson["editor-devtools/extension-description-not-for-addon"];
  if (extensionName || extensionDescription) {
    translations[locale] = {};
  }
  if (extensionName) {
    translations[locale].extensionName = { message: extensionName };
  }
  if (extensionDescription) {
    translations[locale].extensionDescription = { message: extensionDescription };
  }
  await fs.ensureDir(`./tmp/l10n/${locale}`);
  return Promise.all([
    fs.writeFile(`./tmp/l10n/${locale}/editor-devtools.json`, JSON.stringify(l10njson), "utf8"),
    fetch(`${RAW_PREFIX}/addons-l10n/${locale}/_general.json`)
      .then(resp => pipeline(resp.body, fs.createWriteStream(`./tmp/l10n/${locale}/_general.json`)))
  ]);
}));
success("downloaded addon translations");

const en = translations.en;
Object.keys(translations).forEach(locale => {
  if (!translations[locale].extensionName) {
    translations[locale].extensionName = Object.assign({}, en.extensionName);
  }
});
await Promise.all(Object.keys(translations).map(async locale => {
  await fs.ensureDir(`./tmp/_locales/${locale}`);
  await fs.writeFile(`./tmp/_locales/${locale}/messages.json`, JSON.stringify(translations[locale]), "utf8");
}));
success("created extension translations");

// Finally remove and move README
await fs.rm("./tmp/README.md");
await fs.move("./tmp/REAL_README.md", "./tmp/README.md");
success("replaced README");