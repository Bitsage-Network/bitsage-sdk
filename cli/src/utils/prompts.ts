import inquirer from 'inquirer';
import chalk from 'chalk';

export interface SelectOption<T = string> {
  name: string;
  value: T;
  description?: string;
}

export async function confirm(message: string, defaultValue = false): Promise<boolean> {
  const { confirmed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmed',
      message,
      default: defaultValue,
    },
  ]);
  return confirmed;
}

export async function input(
  message: string,
  options?: {
    default?: string;
    validate?: (input: string) => boolean | string;
  }
): Promise<string> {
  const { value } = await inquirer.prompt([
    {
      type: 'input',
      name: 'value',
      message,
      default: options?.default,
      validate: options?.validate,
    },
  ]);
  return value;
}

export async function password(
  message: string,
  options?: {
    validate?: (input: string) => boolean | string;
  }
): Promise<string> {
  const { value } = await inquirer.prompt([
    {
      type: 'password',
      name: 'value',
      message,
      mask: '*',
      validate: options?.validate,
    },
  ]);
  return value;
}

export async function select<T = string>(
  message: string,
  choices: SelectOption<T>[]
): Promise<T> {
  const { selected } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selected',
      message,
      choices: choices.map(c => ({
        name: c.description ? `${c.name} ${chalk.gray(`- ${c.description}`)}` : c.name,
        value: c.value,
      })),
    },
  ]);
  return selected;
}

export async function multiSelect<T = string>(
  message: string,
  choices: SelectOption<T>[]
): Promise<T[]> {
  const { selected } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selected',
      message,
      choices: choices.map(c => ({
        name: c.description ? `${c.name} ${chalk.gray(`- ${c.description}`)}` : c.name,
        value: c.value,
      })),
    },
  ]);
  return selected;
}

export function validateAddress(input: string): boolean | string {
  if (!input.startsWith('0x')) {
    return 'Address must start with 0x';
  }
  if (!/^0x[0-9a-fA-F]+$/.test(input)) {
    return 'Address must be a valid hex string';
  }
  return true;
}

export function validateUrl(input: string): boolean | string {
  try {
    new URL(input);
    return true;
  } catch {
    return 'Invalid URL format';
  }
}

export function validatePositiveNumber(input: string): boolean | string {
  const num = parseFloat(input);
  if (isNaN(num) || num <= 0) {
    return 'Must be a positive number';
  }
  return true;
}

export default { confirm, input, password, select, multiSelect };
