import * as vscode from 'vscode';
import https from 'https';
import { log, logError } from './utils/logger';

// Replace with your actual Gumroad product ID after creating the product
const GUMROAD_PRODUCT_ID = 'ekOAZ4xr2YS00sOBg4iA8Q==';

const LICENSE_SECRET_KEY = 'maestroMcp.licenseKey';
const LICENSE_CACHE_KEY = 'maestroMcp.licenseValid';
const LICENSE_EMAIL_KEY = 'maestroMcp.licenseEmail';
const LICENSE_CACHE_EXPIRY_KEY = 'maestroMcp.licenseCacheExpiry';
const CACHE_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface LicenseStatus {
  valid: boolean;
  email?: string;
  message: string;
}

let extensionContext: vscode.ExtensionContext | undefined;
let memoryLicenseValid: boolean | undefined;

export function setMemoryLicenseValid(valid: boolean | undefined): void {
  memoryLicenseValid = valid;
}

export function initLicense(context: vscode.ExtensionContext): void {
  extensionContext = context;
  // Pre-warm: check all key sources and set memory flag
  getLicenseKey().then(key => {
    log(`[License] initLicense: key=${key ? 'present' : 'missing'}`);
    if (key) {
      validateLicense(key).then(status => {
        if (status.valid) {
          memoryLicenseValid = true;
          cacheResult(status);
          log(`[License] initLicense: pre-warmed, valid=true`);
        }
      }).catch(() => {
        const cached = context.globalState.get<boolean>(LICENSE_CACHE_KEY);
        if (cached) {
          memoryLicenseValid = true;
          log(`[License] initLicense: using cached result`);
        }
      });
    }
  });
}

export async function getLicenseKey(): Promise<string | undefined> {
  if (!extensionContext) return undefined;

  const secret = await extensionContext.secrets.get(LICENSE_SECRET_KEY);
  if (secret) return secret;

  const fromSettings = vscode.workspace.getConfiguration('maestroMcp').get<string>('licenseKey');
  if (fromSettings) return fromSettings;

  return undefined;
}

export async function setLicenseKey(key: string): Promise<void> {
  if (!extensionContext) {
    log('[License] setLicenseKey: no extensionContext!');
    return;
  }
  try {
    await extensionContext.secrets.store(LICENSE_SECRET_KEY, key);
    log('[License] setLicenseKey: stored to SecretStorage OK');
    // Verify it was actually stored
    const verify = await extensionContext.secrets.get(LICENSE_SECRET_KEY);
    log(`[License] setLicenseKey: verify read back=${verify ? 'present' : 'MISSING'}`);
  } catch (err) {
    log(`[License] setLicenseKey: SecretStorage error: ${err}`);
  }
}

export async function clearLicenseKey(): Promise<void> {
  memoryLicenseValid = undefined;
  if (!extensionContext) return;
  await extensionContext.secrets.delete(LICENSE_SECRET_KEY);
  await extensionContext.globalState.update(LICENSE_CACHE_KEY, undefined);
  await extensionContext.globalState.update(LICENSE_EMAIL_KEY, undefined);
  await extensionContext.globalState.update(LICENSE_CACHE_EXPIRY_KEY, undefined);
}

export async function isLicenseValid(): Promise<boolean> {
  // Debug: check if we're in the same module instance
  const globalFlag = (globalThis as any).__maestroMemFlag;
  const globalFlagValue = typeof globalFlag === 'function' ? globalFlag() : 'no-fn';
  log(`[License] isLicenseValid: memoryLicenseValid=${memoryLicenseValid}, globalFlag=${globalFlagValue}, sameCtx=${extensionContext === (globalThis as any).__maestroLicenseCtx}`);

  // In-memory flag (most reliable, survives SecretStorage/globalState issues)
  if (memoryLicenseValid === true) {
    return true;
  }

  // Fallback: check globalThis flag (cross-module-instance)
  if (globalFlagValue === true) {
    memoryLicenseValid = true;
    return true;
  }

  if (!extensionContext) {
    log('[License] isLicenseValid: no extensionContext');
    return false;
  }

  // Check cache
  const expiry = extensionContext.globalState.get<number>(LICENSE_CACHE_EXPIRY_KEY);
  const cached = extensionContext.globalState.get<boolean>(LICENSE_CACHE_KEY);
  log(`[License] isLicenseValid: memory=${memoryLicenseValid}, cache=${cached}, expiry=${expiry}`);

  if (expiry && Date.now() < expiry && cached === true) {
    memoryLicenseValid = true;
    return true;
  }

  // Validate from stored key
  const key = await getLicenseKey();
  log(`[License] isLicenseValid: key=${key ? 'present' : 'missing'}`);
  if (!key) return false;

  const status = await validateLicense(key);
  await cacheResult(status);
  memoryLicenseValid = status.valid;
  return status.valid;
}

export async function validateLicense(licenseKey: string): Promise<LicenseStatus> {
  try {
    const response = await gumroadVerify(licenseKey);

    if (response.success) {
      const email = response.purchase?.email ?? 'unknown';
      log(`[License] Valid license for ${email}`);
      return { valid: true, email, message: `Licensed to ${email}` };
    } else {
      log(`[License] Invalid license key`);
      return { valid: false, message: response.message ?? 'Invalid license key.' };
    }
  } catch (err: any) {
    logError('[License] Verification failed', err);
    // On network error, use cached result if available
    if (extensionContext) {
      const cached = extensionContext.globalState.get<boolean>(LICENSE_CACHE_KEY);
      if (cached !== undefined) {
        log(`[License] Network error, using cached result: ${cached}`);
        return {
          valid: cached,
          email: extensionContext.globalState.get<string>(LICENSE_EMAIL_KEY),
          message: `Offline — using cached license status`,
        };
      }
    }
    return { valid: false, message: `Verification failed: ${err.message ?? err}` };
  }
}

async function cacheResult(status: LicenseStatus): Promise<void> {
  if (!extensionContext) return;
  await extensionContext.globalState.update(LICENSE_CACHE_KEY, status.valid);
  await extensionContext.globalState.update(LICENSE_EMAIL_KEY, status.email);
  await extensionContext.globalState.update(LICENSE_CACHE_EXPIRY_KEY, Date.now() + CACHE_DURATION_MS);
}

function gumroadVerify(licenseKey: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      product_id: GUMROAD_PRODUCT_ID,
      license_key: licenseKey,
    });

    const req = https.request(
      {
        hostname: 'api.gumroad.com',
        path: '/v2/licenses/verify',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
      },
      (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error(`Invalid response: ${data}`));
          }
        });
      },
    );

    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.write(postData);
    req.end();
  });
}

// ── Commands ──

export async function enterLicenseCommand(): Promise<void> {
  const key = await vscode.window.showInputBox({
    prompt: 'Enter your Maestro MCP license key',
    placeHolder: 'XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX',
    password: true,
  });

  if (!key) return;

  const status = await validateLicense(key);

  if (status.valid) {
    try {
      await setLicenseKey(key);
      log('[License] enterLicense: setLicenseKey done');
    } catch (err) {
      log(`[License] enterLicense: setLicenseKey FAILED: ${err}`);
    }
    try {
      await cacheResult(status);
      log('[License] enterLicense: cacheResult done');
    } catch (err) {
      log(`[License] enterLicense: cacheResult FAILED: ${err}`);
    }
    memoryLicenseValid = true;
    log(`[License] enterLicense: memoryLicenseValid set to ${memoryLicenseValid}`);

    (globalThis as any).__maestroLicenseCtx = extensionContext;
    (globalThis as any).__maestroMemFlag = () => memoryLicenseValid;

    vscode.window.showInformationMessage(`Maestro MCP: License activated! ${status.message}`);
  } else {
    vscode.window.showErrorMessage(`Maestro MCP: ${status.message}`);
  }
}

export async function licenseStatusCommand(): Promise<void> {
  const key = await getLicenseKey();
  if (!key) {
    const action = await vscode.window.showInformationMessage(
      'Maestro MCP: No license key set. Premium categories (LSP providers) require a license.',
      'Enter License Key',
      'Get License',
    );
    if (action === 'Enter License Key') {
      await enterLicenseCommand();
    } else if (action === 'Get License') {
      vscode.env.openExternal(vscode.Uri.parse('https://abyo-software.gumroad.com/l/maestro-mcp'));
    }
    return;
  }

  const status = await validateLicense(key);
  await cacheResult(status);

  if (status.valid) {
    const action = await vscode.window.showInformationMessage(
      `Maestro MCP: ${status.message}`,
      'Deactivate License',
    );
    if (action === 'Deactivate License') {
      await clearLicenseKey();
      vscode.window.showInformationMessage('Maestro MCP: License deactivated.');
    }
  } else {
    vscode.window.showWarningMessage(`Maestro MCP: ${status.message}`);
  }
}
