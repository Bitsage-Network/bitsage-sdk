import { Command } from 'commander';

const DEFAULT_CONTRACT = '0x604ff202cf107d754afcc86c760fbf54430c13591ef72db214bb5c82de4c696';
const DEFAULT_RPC = 'https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_8/demo';

export const submitCommand = new Command('submit')
  .description('Submit a recursive STARK proof to Starknet for on-chain verification')
  .argument('<proof-file>', 'Path to proof JSON file')
  .option('--contract <address>', 'Recursive verifier contract', process.env.RECURSIVE_CONTRACT || DEFAULT_CONTRACT)
  .option('--rpc <url>', 'Starknet RPC URL', process.env.STARKNET_RPC || DEFAULT_RPC)
  .option('--account <address>', 'Starknet account address', process.env.STARKNET_ACCOUNT)
  .option('--private-key <key>', 'Starknet private key', process.env.STARKNET_PRIVATE_KEY)
  .action(async (proofFile: string, opts: any) => {
    const fs = await import('fs');
    const { Account, RpcProvider, CallData } = await import('starknet');

    if (!opts.privateKey) {
      console.error('ERROR: --private-key or STARKNET_PRIVATE_KEY required');
      process.exit(1);
    }
    if (!opts.account) {
      console.error('ERROR: --account or STARKNET_ACCOUNT required');
      process.exit(1);
    }

    const raw = JSON.parse(fs.readFileSync(proofFile, 'utf-8'));
    const recursive = raw.recursive_proof;

    if (!recursive?.calldata?.length) {
      console.error('ERROR: No recursive_proof.calldata in proof file');
      process.exit(1);
    }

    const modelId = raw.model_id || '0x1';
    const ioCommitment = raw.io_commitment || '0x1';
    const circuitHash = recursive.circuit_hash || '0x1';
    const weightRoot = recursive.weight_super_root || '0x1';
    const calldata = recursive.calldata;

    console.log(`Contract:    ${opts.contract}`);
    console.log(`Model ID:    ${modelId}`);
    console.log(`Circuit:     ${circuitHash}`);
    console.log(`Weights:     ${weightRoot}`);
    console.log(`Calldata:    ${calldata.length} felts`);

    const provider = new RpcProvider({ nodeUrl: opts.rpc });
    const account = new Account(provider, opts.account, opts.privateKey);

    // Register model
    try {
      await provider.callContract({
        contractAddress: opts.contract,
        entrypoint: 'get_recursive_verification_count',
        calldata: [modelId],
      });
      console.log('Register:    skip (already registered)');
    } catch {
      console.log('Register:    registering...');
      const regTx = await account.execute({
        contractAddress: opts.contract,
        entrypoint: 'register_model_recursive',
        calldata: CallData.compile({
          model_id: modelId,
          circuit_hash: circuitHash,
          weight_super_root: weightRoot,
        }),
      });
      await provider.waitForTransaction(regTx.transaction_hash);
      console.log(`Register:    done (${regTx.transaction_hash.slice(0, 18)}...)`);
    }

    // Submit proof
    console.log('Submitting...');
    const tx = await account.execute({
      contractAddress: opts.contract,
      entrypoint: 'verify_recursive',
      calldata: CallData.compile({
        model_id: modelId,
        io_commitment: ioCommitment,
        stark_proof_data: calldata,
      }),
    });
    console.log(`TX:          ${tx.transaction_hash}`);

    const receipt = await provider.waitForTransaction(tx.transaction_hash);
    console.log(`Status:      ${receipt.execution_status}`);

    if (receipt.execution_status === 'REVERTED') {
      console.error(`Revert:      ${(receipt.revert_reason || '').slice(0, 300)}`);
      process.exit(1);
    }

    console.log(`Explorer:    https://sepolia.starkscan.co/tx/${tx.transaction_hash}`);
  });
