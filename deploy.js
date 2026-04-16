#!/usr/bin/env node

/**
 * VoxEngine Scenario Deployment Script
 *
 * Deploys VoxEngine scenarios, modules, and application config to Voximplant
 * using the voxengine-ci tool. Run with: node deploy.js
 *
 * Requires:
 *   - @voximplant/voxengine-ci installed
 *   - VOX_CI_CREDENTIALS and VOX_CI_ROOT_PATH set in .env
 *   - vox_ci_credentials.json downloaded from Voximplant
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Load env
require('dotenv').config();

const credPath = process.env.VOX_CI_CREDENTIALS || './vox_ci_credentials.json';
const rootPath = process.env.VOX_CI_ROOT_PATH || './voxfiles';
const appName = process.env.VOXIMPLANT_APPLICATION_NAME;

// Validate
if (!fs.existsSync(credPath)) {
  console.error(`ERROR: Credentials file not found at ${credPath}`);
  console.error('Download your service account credentials from:');
  console.error('  Voximplant Control Panel → Settings → Service Accounts');
  process.exit(1);
}

if (!appName) {
  console.error('ERROR: VOXIMPLANT_APPLICATION_NAME not set in .env');
  process.exit(1);
}

function run(cmd) {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: 'inherit', env: { ...process.env, VOX_CI_CREDENTIALS: credPath, VOX_CI_ROOT_PATH: rootPath } });
}

console.log('=== VoxEngine Deployment ===');
console.log(`Application: ${appName}`);
console.log(`Credentials: ${credPath}`);
console.log(`Root path: ${rootPath}`);

// Initialize if needed
const initFlag = path.join(rootPath, '.voxengine-ci');
if (!fs.existsSync(initFlag)) {
  console.log('\nInitializing voxengine-ci...');
  run('npx voxengine-ci init');
}

// Dry run first
console.log('\n--- Dry Run ---');
try {
  run(`npx voxengine-ci upload --application-name ${appName} --dry-run`);
} catch (err) {
  console.error('Dry run failed. Check your configuration.');
  process.exit(1);
}

// Confirm deployment
if (process.argv.includes('--yes') || process.argv.includes('-y')) {
  console.log('\n--- Deploying ---');
  run(`npx voxengine-ci upload --application-name ${appName}`);
  console.log('\nDeployment complete!');
} else {
  console.log('\nDry run successful. Run with --yes to deploy:');
  console.log('  node deploy.js --yes');
}
