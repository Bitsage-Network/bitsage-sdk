import ora, { Ora } from 'ora';

export interface SpinnerOptions {
  text: string;
  color?: 'blue' | 'green' | 'yellow' | 'red' | 'cyan' | 'magenta' | 'white';
}

let currentSpinner: Ora | null = null;

export function startSpinner(options: string | SpinnerOptions): Ora {
  // Stop any existing spinner
  if (currentSpinner) {
    currentSpinner.stop();
  }

  const opts = typeof options === 'string' ? { text: options } : options;

  currentSpinner = ora({
    text: opts.text,
    color: opts.color || 'cyan',
    spinner: 'dots',
  }).start();

  return currentSpinner;
}

export function stopSpinner(success = true, text?: string): void {
  if (currentSpinner) {
    if (success) {
      currentSpinner.succeed(text);
    } else {
      currentSpinner.fail(text);
    }
    currentSpinner = null;
  }
}

export function updateSpinner(text: string): void {
  if (currentSpinner) {
    currentSpinner.text = text;
  }
}

export async function withSpinner<T>(
  text: string,
  fn: () => Promise<T>,
  successText?: string,
  failText?: string
): Promise<T> {
  const spinner = startSpinner(text);

  try {
    const result = await fn();
    spinner.succeed(successText || text);
    return result;
  } catch (error) {
    spinner.fail(failText || `Failed: ${text}`);
    throw error;
  }
}

export default { startSpinner, stopSpinner, updateSpinner, withSpinner };
