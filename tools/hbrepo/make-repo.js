#!/usr/bin/env node
/* TV Home: make a Homebrew Channel repository (apps.json + manifest) for a release, so a
   rooted TV can install and update TV Home from the Homebrew Channel's app list.

   Usage: node tools/hbrepo/make-repo.js <dist dir with the .ipk files> <out dir> <tag> [owner/repo]
   Writes <out>/apps.json (lean build) and <out>/full/apps.json (normal build, with diagnostics).
   The release workflow runs this and publishes <out> to GitHub Pages.
   Plain ES5 and Node's built-in modules only, like the rest of the repo. */
'use strict';

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var dist = process.argv[2], out = process.argv[3], tag = process.argv[4];
var repo = process.argv[5] || 'geekyboi/web-osome';
if (!dist || !out || !tag) { console.log('Usage: node make-repo.js <dist dir> <out dir> <tag> [owner/repo]'); process.exit(1); }

var root = path.join(__dirname, '..', '..');
var app = JSON.parse(fs.readFileSync(path.join(root, 'appinfo.json'), 'utf8'));
var download = 'https://github.com/' + repo + '/releases/download/' + tag + '/';
// where GitHub Pages serves this: the icon must be a full address (the Channel doesn't resolve it)
var pages = 'https://' + repo.split('/')[0].toLowerCase() + '.github.io/' + repo.split('/')[1] + '/';

// The sha256 of a file, as hex (the Homebrew Channel checks it after downloading).
function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

// Write one repository: apps.json, the release manifest and the icon, in dir.
function writeRepo(dir, sub, ipk, note) {
  var file = path.join(dist, ipk);
  if (!fs.existsSync(file)) { console.error('missing ' + file); process.exit(1); }
  fs.mkdirSync(path.join(dir, 'releases'), { recursive: true });
  fs.copyFileSync(path.join(root, app.icon), path.join(dir, 'icon.png'));
  var desc = 'A lighter home screen for LG webOS TVs: no ads or tracking, less RAM and CPU. ' + note;
  fs.writeFileSync(path.join(dir, 'releases', 'latest.json'), JSON.stringify({
    id: app.id,
    version: app.version,
    type: app.type,
    title: app.title,
    appDescription: desc,
    iconUri: pages + sub + 'icon.png',
    sourceUrl: 'https://github.com/' + repo,
    rootRequired: 'optional',
    ipkUrl: download + ipk,
    ipkHash: { sha256: sha256(file) }
  }, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'apps.json'), JSON.stringify({
    paging: { page: 1, count: 1, maxPage: 1, itemsPerPage: 1 },
    packages: [{
      id: app.id,
      title: app.title,
      iconUri: pages + sub + 'icon.png',
      manifestUrl: 'releases/latest.json',
      shortDescription: desc,
      fullDescriptionUrl: 'description.html',
      category: 'launcher'
    }]
  }, null, 2) + '\n');
  // the Channel shows this as HTML; bare text gets its first line cut off, so use paragraphs
  fs.writeFileSync(path.join(dir, 'description.html'), '<p>A lighter home screen for LG webOS TVs: no ads or tracking, less RAM and CPU.</p>\n' +
    '<p>' + note + '</p>\n<p>After installing, run startup/install.sh once as root to open TV Home at power-on and enable the phone editor.</p>\n');
  console.log('Repository in ' + dir + ' -> ' + ipk);
}

var v = app.version;
writeRepo(out, '', 'net.local.tvhome_' + v + '_all-lean.ipk', 'Lean build.');
writeRepo(path.join(out, 'full'), 'full/', 'net.local.tvhome_' + v + '_all.ipk', 'Normal build, with the tools/perf diagnostics.');
fs.writeFileSync(path.join(out, 'index.html'), '<!doctype html><meta charset="utf-8"><title>TV Home repository</title>' +
  '<p>Homebrew Channel repository for <a href="https://github.com/' + repo + '">TV Home</a>. ' +
  'In the Homebrew Channel: Settings, Add repository, then this page\'s address followed by <code>apps.json</code> ' +
  '(or <code>full/apps.json</code> for the build with diagnostics).</p>\n');
