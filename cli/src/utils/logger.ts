import chalk from 'chalk';

export const logger = {
  info: (message: string) => console.log(chalk.blue('[INFO]'), message),
  success: (message: string) => console.log(chalk.green('[OK]'), message),
  warn: (message: string) => console.log(chalk.yellow('[WARN]'), message),
  error: (message: string) => console.log(chalk.red('[ERROR]'), message),
  debug: (message: string) => {
    if (process.env.DEBUG) {
      console.log(chalk.gray('[DEBUG]'), message);
    }
  },

  // Formatted output
  heading: (message: string) => {
    console.log();
    console.log(chalk.bold.cyan(message));
    console.log(chalk.cyan('='.repeat(message.length)));
  },

  table: (data: Record<string, string | number | boolean>) => {
    const maxKeyLen = Math.max(...Object.keys(data).map(k => k.length));
    for (const [key, value] of Object.entries(data)) {
      console.log(`  ${chalk.gray(key.padEnd(maxKeyLen))}  ${value}`);
    }
  },

  list: (items: string[]) => {
    for (const item of items) {
      console.log(`  ${chalk.gray('•')} ${item}`);
    }
  },

  // Box output for important info
  box: (title: string, content: string[]) => {
    const maxLen = Math.max(title.length, ...content.map(c => c.length));
    const border = '─'.repeat(maxLen + 4);

    console.log();
    console.log(chalk.cyan(`┌${border}┐`));
    console.log(chalk.cyan('│'), chalk.bold(title.padEnd(maxLen + 2)), chalk.cyan('│'));
    console.log(chalk.cyan(`├${border}┤`));
    for (const line of content) {
      console.log(chalk.cyan('│'), line.padEnd(maxLen + 2), chalk.cyan('│'));
    }
    console.log(chalk.cyan(`└${border}┘`));
    console.log();
  },
};

export default logger;
