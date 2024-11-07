import { Client, Wallet, xrpToDrops, OfferCreate, Payment, AMMDeposit, AMMCreate, AMMBid } from 'xrpl';
import dotenv from 'dotenv';

dotenv.config();

const xrplService = {
  createToken: async (params: any) => {
    // Unpack parameters
    const {
      tokenName,
      tokenSymbol,
      decimalPlaces,
      issuerSeed,
    } = params;

    // Constants
    const totalSupply = '10000000000'; // 10,000,000,000 tokens
    const bondingCurveXRP = '10000';   // Collect 10,000 XRP via bonding curve

    // Initialize client
    const client = new Client(process.env.XRPL_ENDPOINT!);

    try {
      await client.connect();

      // Generate issuer wallet
      const issuerWallet = Wallet.fromSeed(issuerSeed);
      const issuerAddress = issuerWallet.classicAddress;

      // **Step 1: Set Account Settings**
      // Enable DefaultRipple and other necessary settings
      const settingsTx = {
        TransactionType: 'AccountSet',
        Account: issuerAddress,
        SetFlag: 8, // DefaultRipple
      };

      const preparedSettingsTx = await client.autofill(settingsTx);
      const signedSettingsTx = issuerWallet.sign(preparedSettingsTx);
      const settingsResult = await client.submitAndWait(signedSettingsTx.tx_blob);

      if (settingsResult.result.meta.TransactionResult !== 'tesSUCCESS') {
        throw new Error('Failed to set account settings.');
      }

      console.log('Account settings configured.');

      // **Step 2: Issue the Token**
      // Send the total supply to the issuer's account
      const issueTokenTx: Payment = {
        TransactionType: 'Payment',
        Account: issuerAddress,
        Destination: issuerAddress,
        Amount: {
          currency: tokenSymbol,
          value: totalSupply,
          issuer: issuerAddress,
        },
      };

      const preparedIssueTokenTx = await client.autofill(issueTokenTx);
      const signedIssueTokenTx = issuerWallet.sign(preparedIssueTokenTx);
      const issueResult = await client.submitAndWait(signedIssueTokenTx.tx_blob);

      if (issueResult.result.meta.TransactionResult !== 'tesSUCCESS') {
        throw new Error('Failed to issue token.');
      }

      console.log(`Token ${tokenSymbol} issued with total supply ${totalSupply}.`);

      // **Step 3: Simulate Bonding Curve Sale**
      // Create incremental sell offers to simulate a bonding curve
      const bondingCurveOffers = [
        { price: '0.0001', amount: '1000000000' }, // 1,000,000,000 tokens at 0.0001 XRP each
        { price: '0.0002', amount: '2000000000' }, // 2,000,000,000 tokens at 0.0002 XRP each
        { price: '0.0005', amount: '3000000000' }, // 3,000,000,000 tokens at 0.0005 XRP each
        { price: '0.001',  amount: '4000000000' }, // 4,000,000,000 tokens at 0.001 XRP each
      ];

      for (const offer of bondingCurveOffers) {
        const takerPaysValue = (parseFloat(offer.price) * parseFloat(offer.amount)).toFixed(6); // XRP amount

        const sellOfferTx: OfferCreate = {
          TransactionType: 'OfferCreate',
          Account: issuerAddress,
          TakerGets: {
            currency: tokenSymbol,
            issuer: issuerAddress,
            value: offer.amount,
          },
          TakerPays: xrpToDrops(takerPaysValue), // Convert XRP amount to drops
          Flags: 0,
        };

        const preparedSellOfferTx = await client.autofill(sellOfferTx);
        const signedSellOfferTx = issuerWallet.sign(preparedSellOfferTx);
        const sellOfferResult = await client.submitAndWait(signedSellOfferTx.tx_blob);

        if (sellOfferResult.result.meta.TransactionResult !== 'tesSUCCESS') {
          throw new Error(`Failed to create sell offer at price ${offer.price}.`);
        }

        console.log(`Sell offer created: ${offer.amount} ${tokenSymbol} at ${offer.price} XRP each.`);
      }

      console.log('Bonding curve offers created.');

      // **Step 4: Deposit into Liquidity Pool**
      // After the bonding curve sale, deposit the collected XRP and remaining tokens into an AMM liquidity pool

      // **Fetch Account Balances**
      const accountInfo = await client.request({
        command: 'account_lines',
        account: issuerAddress,
        ledger_index: 'validated',
      });

      // Calculate remaining tokens
      let remainingTokens = totalSupply;
      for (const offer of bondingCurveOffers) {
        remainingTokens = (parseFloat(remainingTokens) - parseFloat(offer.amount)).toString();
      }

      // Fetch collected XRP
      const accountData = await client.request({
        command: 'account_info',
        account: issuerAddress,
        ledger_index: 'validated',
      });

      const collectedXRP = parseFloat(accountData.result.account_data.Balance) / 1_000_000; // Convert drops to XRP

      console.log(`Collected XRP: ${collectedXRP} XRP`);
      console.log(`Remaining Tokens: ${remainingTokens} ${tokenSymbol}`);

      // **Create AMM Instance**
      const createAmmTx: AMMCreate = {
        TransactionType: 'AMMCreate',
        Account: issuerAddress,
        Amount: xrpToDrops(collectedXRP.toString()),
        Amount2: {
          currency: tokenSymbol,
          issuer: issuerAddress,
          value: remainingTokens,
        },
        TradingFee: 0, // Optional: Set trading fee
      };

      const preparedAmmTx = await client.autofill(createAmmTx);
      const signedAmmTx = issuerWallet.sign(preparedAmmTx);
      const ammResult = await client.submitAndWait(signedAmmTx.tx_blob);

      if (ammResult.result.meta.TransactionResult !== 'tesSUCCESS') {
        throw new Error('Failed to create AMM instance.');
      }

      console.log('Liquidity pool created and funds deposited.');

      // **Step 5: Burn Liquidity Pool Tokens**
      // Withdraw and burn LP tokens

      // **Note**: The actual burning of LP tokens might differ based on the XRPL's implementation of AMMs.
      // For demonstration, we'll withdraw LP tokens and send them to a blackhole address.

      // **Fetch AMM Information**
      const ammInfo = await client.request({
        command: 'amm_info',
        amm_account: issuerAddress,
        ledger_index: 'validated',
      });

      const lpTokenBalance = ammInfo.result.lp_token.balance;

      console.log(`LP Token Balance: ${lpTokenBalance}`);

      // **Withdraw LP Tokens**
      const withdrawAmmTx: AMMDeposit = {
        TransactionType: 'AMMWithdraw',
        Account: issuerAddress,
        LPTokenOut: lpTokenBalance,
        // Use the EPrice flag to specify withdrawal by LP tokens
        Flags: 0x00080000,
      };

      const preparedWithdrawAmmTx = await client.autofill(withdrawAmmTx);
      const signedWithdrawAmmTx = issuerWallet.sign(preparedWithdrawAmmTx);
      const withdrawResult = await client.submitAndWait(signedWithdrawAmmTx.tx_blob);

      if (withdrawResult.result.meta.TransactionResult !== 'tesSUCCESS') {
        throw new Error('Failed to withdraw LP tokens.');
      }

      console.log('LP tokens withdrawn.');

      // **Burn LP Tokens**
      // Send LP tokens to a blackhole address to burn them
      const burnAddress = 'rrrrrrrrrrrrrrrrrrrrrhoLvTp'; // A known blackhole address

      const burnLpTokensTx: Payment = {
        TransactionType: 'Payment',
        Account: issuerAddress,
        Destination: burnAddress,
        Amount: {
          currency: ammInfo.result.lp_token.currency,
          issuer: issuerAddress,
          value: lpTokenBalance,
        },
      };

      const preparedBurnLpTokensTx = await client.autofill(burnLpTokensTx);
      const signedBurnLpTokensTx = issuerWallet.sign(preparedBurnLpTokensTx);
      const burnResult = await client.submitAndWait(signedBurnLpTokensTx.tx_blob);

      if (burnResult.result.meta.TransactionResult !== 'tesSUCCESS') {
        throw new Error('Failed to burn LP tokens.');
      }

      console.log('LP tokens burned.');

      // **Disconnect Client**
      await client.disconnect();

      return {
        success: true,
        message: 'Token created, bonding curve simulated, liquidity added, and LP tokens burned successfully.',
      };
    } catch (error) {
      console.error('Error in createToken:', error);
      await client.disconnect();
      throw error;
    }
  },
};

export default xrplService;
