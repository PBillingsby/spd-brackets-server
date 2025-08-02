import {
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAccount,
  getAssociatedTokenAddress,
} from '@solana/spl-token';
import {
  clusterApiUrl,
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import dotenv from 'dotenv';
import express, { Request, Response } from 'express';

dotenv.config();
const router = express.Router();

const HASH_PRIVATE_KEY = process.env.HASH_PRIVATE_KEY;
const PRESALE_MINT_ADDRESS = process.env.PRESALE_MINT_ADDRESS;
const PRESALE_RECIPIENT_KEY = process.env.PRESALE_RECIPIENT_KEY;
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || clusterApiUrl('devnet');

// Validation middleware
const validateEnvVars = (req: Request, res: Response, next: any) => {
  if (!HASH_PRIVATE_KEY || !PRESALE_MINT_ADDRESS || !PRESALE_RECIPIENT_KEY) {
    console.error('Missing environment variables:', {
      HASH_PRIVATE_KEY: !!HASH_PRIVATE_KEY,
      PRESALE_MINT_ADDRESS: !!PRESALE_MINT_ADDRESS,
      PRESALE_RECIPIENT_KEY: !!PRESALE_RECIPIENT_KEY
    });
    return res.status(500).json({ error: 'Server configuration error: Missing environment variables' });
  }
  next();
};

router.use(validateEnvVars);

// --------- Route 1: Create Transaction ---------
router.post('/create-transaction', async (req: Request, res: Response) => {
  try {
    const { senderPublicKey, presaleAmount = 5 } = req.body; // Default to 5 USDC if not provided

    if (!senderPublicKey) {
      return res.status(400).json({ error: 'Missing senderPublicKey' });
    }

    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

    const usdcMint = new PublicKey(PRESALE_MINT_ADDRESS!);
    const recipient = new PublicKey(PRESALE_RECIPIENT_KEY!);
    const senderPubkey = new PublicKey(senderPublicKey);

    // Get server keypair
    const serverKeypair = Keypair.fromSecretKey(new Uint8Array(JSON.parse(HASH_PRIVATE_KEY!)));

    const senderATA = await getAssociatedTokenAddress(usdcMint, senderPubkey);
    const recipientATA = await getAssociatedTokenAddress(usdcMint, recipient, true);
    // Check if accounts exist
    try {
      const senderAccountInfo = await connection.getAccountInfo(senderATA);
      if (senderAccountInfo) {
        const balance = await connection.getTokenAccountBalance(senderATA);
      }
    } catch (error) {
      console.log('Sender ATA does not exist');
    }

    try {
      const recipientAccountInfo = await connection.getAccountInfo(recipientATA);
    } catch (error) {
      console.log('Recipient ATA does not exist');
    }

    // Create transaction
    const transaction = new Transaction();

    const priorityFees = ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: 1000000,
    });

    transaction.add(priorityFees);
    
    // Set fee payer first
    transaction.feePayer = senderPubkey;

    // Get latest blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash({
      commitment: 'finalized',
    });
    transaction.recentBlockhash = blockhash;

    const validBlockHeightWindow = 150;
    const adjustedLastValidBlockHeight = lastValidBlockHeight + validBlockHeightWindow;

    // Add a zero-lamport transfer that requires server signature
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: serverKeypair.publicKey,
        toPubkey: serverKeypair.publicKey,
        lamports: 0,
      }),
    );

    // Check and create sender ATA if needed
    try {
      await getAccount(connection, senderATA);
    } catch (error) {
      console.log('Creating sender ATA...');
      transaction.add(
        createAssociatedTokenAccountInstruction(
          senderPubkey, // payer
          senderATA,    // ata
          senderPubkey, // owner
          usdcMint      // mint
        )
      );
    }

    // Check and create recipient ATA if needed
    try {
      await getAccount(connection, recipientATA);
    } catch (error) {
      transaction.add(
        createAssociatedTokenAccountInstruction(
          senderPubkey, // payer (sender pays for recipient's ATA)
          recipientATA, // ata
          recipient,    // owner
          usdcMint      // mint
        )
      );
    }

    // Add the actual transfer instruction
    transaction.add(createTransferInstruction(
      senderATA, 
      recipientATA, 
      senderPubkey, 
      Number(presaleAmount) * 1e6
    ));

    // Server signs their required instruction
    transaction.partialSign(serverKeypair);

    const serializedTransaction = transaction
      .serialize({
        requireAllSignatures: false,
      })
      .toString('base64');

    res.status(200).json({
      transaction: serializedTransaction,
      lastValidBlockHeight: adjustedLastValidBlockHeight,
      blockhash,
    });
  } catch (error: any) {
    console.error('Presale creation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// --------- Route 2: Verify + Submit Transaction ---------
router.post('/verify-and-submit-transaction', async (req: Request, res: Response) => {
  try {
    const {
      transaction,
      userData,
      blockhash: requestBlockhash,
      lastValidBlockHeight: requestLastValidBlockHeight,
    } = req.body;

    if (!transaction || typeof transaction !== 'string') {
      throw new Error('Invalid or missing transaction');
    }
    if (!requestBlockhash || typeof requestBlockhash !== 'string') {
      throw new Error('Invalid or missing blockhash');
    }
    if (!requestLastValidBlockHeight || typeof requestLastValidBlockHeight !== 'number') {
      throw new Error('Invalid or missing lastValidBlockHeight');
    }

    const txn = Transaction.from(Buffer.from(transaction, 'base64'));
    
    if (!txn.recentBlockhash) {
      throw new Error('Transaction missing recentBlockhash');
    }
    if (!txn.feePayer) {
      throw new Error('Transaction missing feePayer');
    }

    const serverKeypair = Keypair.fromSecretKey(new Uint8Array(JSON.parse(HASH_PRIVATE_KEY!)));
    const serverKey = new PublicKey(serverKeypair.publicKey);

    if (!txn.signatures || txn.signatures.length === 0) {
      throw new Error('Transaction has no signatures');
    }

    const hasServerSig = txn.signatures.some((sig) => sig.publicKey.equals(serverKey) && sig.signature !== null);
    if (!hasServerSig) {
      throw new Error('Missing or invalid server signature');
    }

    const hasClientSig = txn.signatures.some((sig) => sig.publicKey.equals(txn.feePayer!) && sig.signature !== null);
    if (!hasClientSig) {
      throw new Error('Missing or invalid client signature');
    }

    const connection = new Connection(SOLANA_RPC_URL, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 60000,
    });

    const confirmWithRetry = async (signature: string, blockhash: string, lastValidBlockHeight: number) => {
      const maxRetries = 5;
      let attempts = 0;

      while (attempts < maxRetries) {
        try {
          const confirmation = await connection.confirmTransaction(
            {
              signature,
              blockhash,
              lastValidBlockHeight,
            },
            'confirmed',
          );
          return confirmation;
        } catch (error) {
          attempts++;
          if (attempts === maxRetries) throw error;
          // Exponential backoff
          await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempts) * 1000));
        }
      }
    };

    const txSignature = await connection.sendRawTransaction(Buffer.from(transaction, 'base64'), {
      skipPreflight: false,
      maxRetries: 3,
    });

    const confirmation = await confirmWithRetry(txSignature, requestBlockhash, requestLastValidBlockHeight);

    if (confirmation?.value.err) {
      throw new Error('Transaction failed: ' + JSON.stringify(confirmation.value.err));
    }

    res.status(200).json({
      status: 'successful',
      signature: txSignature,
    });
  } catch (error: any) {
    console.error('Verification error:', error);
    res.status(500).json({ error: `Transaction verification failed: ${error.message}` });
  }
});

export default router;