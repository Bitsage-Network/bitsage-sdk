import { existsSync, mkdirSync, chmodSync, createWriteStream, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir, platform, arch } from 'os';
import { pipeline } from 'stream/promises';
import { createGunzip } from 'zlib';
import tar from 'tar';
import { logger } from '../utils/logger.js';
import { startSpinner, stopSpinner } from '../utils/spinner.js';

export type BinaryName = 'worker' | 'coordinator' | 'validator' | 'indexer';

const GITHUB_REPO = 'Bitsage-Network/bitsage-network';
const BINARY_DIR = join(homedir(), '.bitsage', 'bin');

interface PlatformInfo {
  os: string;
  arch: string;
  ext: string;
}

function getPlatformInfo(): PlatformInfo {
  const p = platform();
  const a = arch();

  let os: string;
  let ext = '';

  switch (p) {
    case 'darwin':
      os = 'darwin';
      break;
    case 'linux':
      os = 'linux';
      break;
    case 'win32':
      os = 'windows';
      ext = '.exe';
      break;
    default:
      throw new Error(`Unsupported platform: ${p}`);
  }

  let archStr: string;
  switch (a) {
    case 'x64':
      archStr = 'x64';
      break;
    case 'arm64':
      archStr = 'arm64';
      break;
    default:
      throw new Error(`Unsupported architecture: ${a}`);
  }

  return { os, arch: archStr, ext };
}

export function getBinaryPath(name: BinaryName): string {
  const { ext } = getPlatformInfo();
  return join(BINARY_DIR, `bitsage-${name}${ext}`);
}

export function binaryExists(name: BinaryName): boolean {
  return existsSync(getBinaryPath(name));
}

export async function getLatestVersion(): Promise<string> {
  const response = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
    {
      headers: { 'Accept': 'application/vnd.github.v3+json' },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch latest version: ${response.status}`);
  }

  const data = await response.json() as { tag_name: string };
  return data.tag_name;
}

export function getBinaryUrl(name: BinaryName, version: string): string {
  const { os, arch } = getPlatformInfo();
  const filename = `bitsage-${name}-${os}-${arch}.tar.gz`;
  return `https://github.com/${GITHUB_REPO}/releases/download/${version}/${filename}`;
}

export async function downloadBinary(
  name: BinaryName,
  version?: string
): Promise<string> {
  // Ensure binary directory exists
  if (!existsSync(BINARY_DIR)) {
    mkdirSync(BINARY_DIR, { recursive: true });
  }

  const targetVersion = version || (await getLatestVersion());
  const url = getBinaryUrl(name, targetVersion);
  const binaryPath = getBinaryPath(name);
  const tempTarPath = join(BINARY_DIR, `${name}.tar.gz`);

  logger.info(`Downloading ${name} ${targetVersion}...`);
  startSpinner(`Downloading bitsage-${name}`);

  try {
    // Download the tarball
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Download failed: ${response.status} ${response.statusText}`);
    }

    // Stream to file
    const fileStream = createWriteStream(tempTarPath);
    // @ts-ignore - Response.body is a ReadableStream in Node 18+
    await pipeline(response.body, fileStream);

    stopSpinner(true, `Downloaded bitsage-${name}`);
    startSpinner(`Extracting bitsage-${name}`);

    // Extract the tarball
    await tar.extract({
      file: tempTarPath,
      cwd: BINARY_DIR,
    });

    // Make executable
    chmodSync(binaryPath, 0o755);

    // Clean up tarball
    unlinkSync(tempTarPath);

    stopSpinner(true, `Installed bitsage-${name} ${targetVersion}`);
    return binaryPath;
  } catch (error) {
    stopSpinner(false, `Failed to download ${name}`);
    // Clean up partial downloads
    try {
      if (existsSync(tempTarPath)) unlinkSync(tempTarPath);
    } catch {}
    throw error;
  }
}

export async function ensureBinary(name: BinaryName): Promise<string> {
  const binaryPath = getBinaryPath(name);

  if (binaryExists(name)) {
    logger.debug(`Binary ${name} already exists at ${binaryPath}`);
    return binaryPath;
  }

  logger.info(`Binary ${name} not found, downloading...`);
  return downloadBinary(name);
}

export async function updateBinary(name: BinaryName): Promise<string> {
  logger.info(`Checking for updates to ${name}...`);

  const currentVersion = await getCurrentVersion(name);
  const latestVersion = await getLatestVersion();

  if (currentVersion === latestVersion) {
    logger.info(`${name} is already up to date (${currentVersion})`);
    return getBinaryPath(name);
  }

  logger.info(`Updating ${name} from ${currentVersion || 'not installed'} to ${latestVersion}`);
  return downloadBinary(name, latestVersion);
}

export async function getCurrentVersion(name: BinaryName): Promise<string | null> {
  const binaryPath = getBinaryPath(name);

  if (!binaryExists(name)) {
    return null;
  }

  try {
    // Try to get version from binary
    const { execSync } = await import('child_process');
    const output = execSync(`${binaryPath} --version`, {
      encoding: 'utf-8',
      timeout: 5000,
    });
    const match = output.match(/v?(\d+\.\d+\.\d+)/);
    return match ? `v${match[1]}` : null;
  } catch {
    return null;
  }
}

export function listInstalledBinaries(): BinaryName[] {
  const binaries: BinaryName[] = ['worker', 'coordinator', 'validator', 'indexer'];
  return binaries.filter(binaryExists);
}
