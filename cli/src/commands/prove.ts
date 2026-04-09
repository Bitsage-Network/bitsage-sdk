import { Command } from 'commander';

const DEFAULT_PROVER = process.env.OBELYSK_PROVER_URL || 'http://localhost:8080';

export const proveCommand = new Command('prove')
  .description('Prove ML model inference and generate a recursive STARK proof')
  .argument('<model>', 'Model name or ID (e.g. smollm2-135m)')
  .option('--input <json>', 'Input tensor as JSON array (e.g. "[1.0, 2.0, 3.0]")')
  .option('--input-file <path>', 'Read input from JSON file')
  .option('--prompt <text>', 'Text prompt — server tokenizes and embeds automatically')
  .option('--gpu', 'Use GPU acceleration', true)
  .option('--on-chain', 'Submit proof to Starknet after proving', false)
  .option('--recursive', 'Use recursive STARK compression', true)
  .option('--prover-url <url>', 'Prover server URL', DEFAULT_PROVER)
  .option('--output <path>', 'Save proof to file')
  .option('--quiet', 'Suppress progress output', false)
  .action(async (model: string, opts: any) => {
    const fetch = (await import('node-fetch')).default;
    const fs = await import('fs');

    const url = opts.proverUrl;

    // Determine input mode: --prompt (text) or --input/--input-file (numeric)
    const useChat = !!opts.prompt;
    let input: number[] | undefined;

    if (opts.prompt && (opts.input || opts.inputFile)) {
      console.error('Error: --prompt cannot be combined with --input or --input-file');
      process.exit(1);
    }

    if (!useChat) {
      input = [1.0, 2.0, 3.0];
      if (opts.input) {
        input = JSON.parse(opts.input);
      } else if (opts.inputFile) {
        input = JSON.parse(fs.readFileSync(opts.inputFile, 'utf-8'));
      }
    }

    if (!opts.quiet) {
      console.log(`Proving model: ${model}`);
      console.log(`Prover: ${url}`);
      if (useChat) {
        console.log(`Prompt: "${opts.prompt}"`);
      } else {
        console.log(`Input: ${input!.length} values`);
      }
      console.log(`GPU: ${opts.gpu}, Recursive: ${opts.recursive}, On-chain: ${opts.onChain}`);
    }

    const endpoint = useChat
      ? '/api/v1/chat'
      : opts.onChain ? '/api/v1/attest' : '/api/v1/infer';
    const body = useChat
      ? { model_id: model, prompt: opts.prompt, gpu: opts.gpu, include_calldata: false }
      : {
          model_id: model,
          input,
          gpu: opts.gpu,
          include_output: true,
          ...(opts.onChain ? { submit_onchain: true, recursive: opts.recursive } : {}),
        };

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const apiKey = process.env.OBELYSK_API_KEY;
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    try {
      const resp = await fetch(`${url}${endpoint}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        console.error(`Error ${resp.status}: ${await resp.text()}`);
        process.exit(1);
      }

      const result = await resp.json() as any;

      if (opts.output) {
        fs.writeFileSync(opts.output, JSON.stringify(result, null, 2));
        if (!opts.quiet) console.log(`Proof saved to: ${opts.output}`);
      }

      if (!opts.quiet) {
        console.log('\n=== Proof Result ===');
        if (result.proof_id) console.log(`Proof ID:      ${result.proof_id}`);
        if (result.num_tokens) console.log(`Tokens:        ${result.num_tokens} (IDs: ${result.token_ids?.join(', ')})`);
        if (result.predicted_text != null) console.log(`Predicted:     "${result.predicted_text}"`);
        if (result.io_commitment) console.log(`IO Commitment: ${result.io_commitment}`);
        if (result.prove_time_ms) console.log(`Prove time:    ${result.prove_time_ms}ms`);
        if (result.calldata_felts) console.log(`Calldata:      ${result.calldata_felts} felts`);
        if (result.calldata_size) console.log(`Calldata:      ${result.calldata_size} felts`);
        if (result.tx_hash) console.log(`TX Hash:       ${result.tx_hash}`);
        if (result.job_id) console.log(`Job ID:        ${result.job_id} (polling...)`);
      }
    } catch (e: any) {
      console.error(`Failed to connect to prover at ${url}: ${e.message}`);
      process.exit(1);
    }
  });
