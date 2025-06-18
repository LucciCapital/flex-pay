import React, { useState, useContext, useEffect } from 'react';
import {
  useAccount,
  useDisconnect,
  useSwitchChain,
  useConfig,
  useBalance,
} from 'wagmi';
import { useConnectionStatus } from '../../hooks/useConnectionStatus';
import { useProfile } from '../../hooks/useProfile';
import { isMobile } from '../../utils/isMobile';
import { Box } from '../Box/Box';
import { CloseButton } from '../CloseButton/CloseButton';
import { Dialog } from '../Dialog/Dialog';
import { DialogContent } from '../Dialog/DialogContent';
import { Text } from '../Text/Text';
import { I18nContext } from '../RainbowKitProvider/I18nContext';
import { useRainbowKitChains } from '../RainbowKitProvider/RainbowKitChainContext';
import { ConnectButtonRenderer } from '../ConnectButton/ConnectButtonRenderer';
import { touchableStyles } from '../../css/touchableStyles';
import { Avatar } from '../Avatar/Avatar';
import ConnectOptions from '../ConnectOptions/ConnectOptions';
import { SignIn } from '../SignIn/SignIn';
import { formatAddress } from '../ConnectButton/formatAddress';
import { formatENS } from '../ConnectButton/formatENS';
import { abbreviateETHBalance } from '../ConnectButton/abbreviateETHBalance';
import { ProfileDetailsAction } from '../ProfileDetails/ProfileDetailsAction';
import { CopyIcon } from '../Icons/Copy';
import { CopiedIcon } from '../Icons/Copied';
import { DisconnectIcon } from '../Icons/Disconnect';
import { ShowRecentTransactionsContext } from '../RainbowKitProvider/ShowRecentTransactionsContext';
import { TxList } from '../Txs/TxList';
import { ActionButton } from '../Button/ActionButton';
import { AsyncImage } from '../AsyncImage/AsyncImage';

// Types for payment flow
interface PaymentAsset {
  type: 'token' | 'nft';
  symbol: string;
  name: string;
  balance: string;
  value?: number; // USD value
  imageUrl?: string;
  contractAddress?: string;
  tokenId?: string; // For NFTs
  floorPrice?: number; // For NFTs
}

interface ConversionRate {
  fromAsset: string;
  toAsset: string;
  rate: number;
  provider: string;
  slippage?: number;
}

interface FlexPayConfig {
  merchantName?: string;
  merchantLogo?: string;
  amount?: number;
  currency?: string;
  description?: string;
  acceptedTokens?: string[]; // Tokens merchant accepts directly
  preferredStablecoin?: 'USDC' | 'USDT' | 'DAI';
}

interface FlexConnectModalProps {
  open: boolean;
  onClose: () => void;
  paymentConfig?: FlexPayConfig;
  onPaymentComplete?: (txHash: string) => void;
}

// Mock function to get conversion rates (in production, this would call a DEX aggregator API)
const getConversionRates = (
  fromAsset: string,
  _amount: number,
): ConversionRate[] => {
  // Mock conversion rates for demo
  const mockRates: Record<string, ConversionRate[]> = {
    ETH: [
      {
        fromAsset: 'ETH',
        toAsset: 'USDC',
        rate: 3850.5,
        provider: 'Uniswap',
        slippage: 0.5,
      },
      {
        fromAsset: 'ETH',
        toAsset: 'USDC',
        rate: 3845.2,
        provider: '1inch',
        slippage: 0.3,
      },
      {
        fromAsset: 'ETH',
        toAsset: 'USDC',
        rate: 3842.0,
        provider: '0x',
        slippage: 0.4,
      },
    ],
    WBTC: [
      {
        fromAsset: 'WBTC',
        toAsset: 'USDC',
        rate: 72500.0,
        provider: 'Uniswap',
        slippage: 0.6,
      },
      {
        fromAsset: 'WBTC',
        toAsset: 'USDC',
        rate: 72450.0,
        provider: 'SushiSwap',
        slippage: 0.5,
      },
    ],
    PEPE: [
      {
        fromAsset: 'PEPE',
        toAsset: 'USDC',
        rate: 0.000021,
        provider: 'Uniswap',
        slippage: 2.5,
      },
    ],
  };

  return (
    mockRates[fromAsset] || [
      {
        fromAsset,
        toAsset: 'USDC',
        rate: 1,
        provider: 'Direct',
        slippage: 0,
      },
    ]
  );
};

// Mock function to get user's assets (in production, this would use real blockchain data)
const getUserAssets = (_address: string): PaymentAsset[] => {
  return [
    {
      type: 'token',
      symbol: 'ETH',
      name: 'Ethereum',
      balance: '2.4521',
      value: 9440.585,
      imageUrl:
        'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png',
    },
    {
      type: 'token',
      symbol: 'USDC',
      name: 'USD Coin',
      balance: '1250.00',
      value: 1250.0,
      imageUrl:
        'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png',
    },
    {
      type: 'token',
      symbol: 'WBTC',
      name: 'Wrapped Bitcoin',
      balance: '0.05',
      value: 3625.0,
      imageUrl:
        'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599/logo.png',
    },
    {
      type: 'token',
      symbol: 'PEPE',
      name: 'Pepe',
      balance: '50000000',
      value: 1050.0,
      imageUrl:
        'https://assets.coingecko.com/coins/images/29850/standard/pepe-token.jpeg',
    },
    {
      type: 'nft',
      symbol: 'BAYC',
      name: 'Bored Ape #1234',
      balance: '1',
      floorPrice: 24.5,
      value: 94382.5, // 24.5 ETH * ETH price
      imageUrl:
        'https://img.seadn.io/files/5e5ce7a76e4e6e1e221c2cc2a1f4f7ed.png',
      tokenId: '1234',
    },
    {
      type: 'nft',
      symbol: 'PUNK',
      name: 'CryptoPunk #5678',
      balance: '1',
      floorPrice: 45.2,
      value: 174046.0,
      imageUrl: 'https://www.larvalabs.com/cryptopunks/cryptopunk5678.png',
      tokenId: '5678',
    },
  ];
};

// Enhanced ConnectModal with payment functionality
export function EnhancedConnectModal({
  open,
  onClose,
  paymentConfig,
  onPaymentComplete,
}: FlexConnectModalProps) {
  const titleId = 'rk_flexpay_title';
  const connectionStatus = useConnectionStatus();
  const { address, isConnecting } = useAccount();
  const { disconnect } = useDisconnect();
  const { chains: _chains } = useConfig();

  // View states for the payment flow
  const [activeView, setActiveView] = useState<
    'assets' | 'payment' | 'confirm' | 'success'
  >('assets');
  const [selectedAsset, setSelectedAsset] = useState<PaymentAsset | null>(null);
  const [conversionRates, setConversionRates] = useState<ConversionRate[]>([]);
  const [selectedRate, setSelectedRate] = useState<ConversionRate | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [txHash, setTxHash] = useState<string>('');

  const { ensName } = useProfile({
    address,
    includeBalance: true,
  });

  const { i18n: _i18n } = useContext(I18nContext);
  const _mobile = isMobile();

  // Get user's assets
  const userAssets = address ? getUserAssets(address) : [];
  const totalPortfolioValue = userAssets.reduce(
    (sum, asset) => sum + (asset.value || 0),
    0,
  );

  // Calculate payment amount needed
  const paymentAmount = paymentConfig?.amount || 100; // Default $100 for demo
  const paymentCurrency = paymentConfig?.currency || 'USD';
  const merchantName = paymentConfig?.merchantName || 'Demo Merchant';
  const merchantLogo = paymentConfig?.merchantLogo;

  // Handle auth cancel
  const onAuthCancel = React.useCallback(() => {
    onClose();
    disconnect();
  }, [onClose, disconnect]);

  const onConnectModalCancel = React.useCallback(() => {
    if (isConnecting) disconnect();
    onClose();
  }, [onClose, disconnect, isConnecting]);

  // Handle asset selection for payment
  const handleAssetSelect = (asset: PaymentAsset) => {
    setSelectedAsset(asset);
    const rates = getConversionRates(asset.symbol, paymentAmount);
    setConversionRates(rates);
    setSelectedRate(rates[0]); // Auto-select best rate
    setActiveView('payment');
  };

  // Process payment
  const processPayment = async () => {
    setIsProcessing(true);

    // Simulate payment processing
    setTimeout(() => {
      const mockTxHash = `0x${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
      setTxHash(mockTxHash);
      setIsProcessing(false);
      setActiveView('success');

      if (onPaymentComplete) {
        onPaymentComplete(mockTxHash);
      }
    }, 2000);
  };

  // Reset view when modal closes
  useEffect(() => {
    if (!open) {
      setActiveView('assets');
      setSelectedAsset(null);
      setConversionRates([]);
      setSelectedRate(null);
      setTxHash('');
    }
  }, [open]);

  // Show connection options when disconnected
  if (connectionStatus === 'disconnected') {
    return (
      <Dialog onClose={onConnectModalCancel} open={open} titleId={titleId}>
        <DialogContent bottomSheetOnMobile padding="0" wide>
          <ConnectOptions onClose={onConnectModalCancel} />
        </DialogContent>
      </Dialog>
    );
  }

  // Show sign in for SIWE
  if (connectionStatus === 'unauthenticated') {
    return (
      <Dialog onClose={onAuthCancel} open={open} titleId={titleId}>
        <DialogContent bottomSheetOnMobile padding="0">
          <SignIn onClose={onAuthCancel} onCloseModal={onClose} />
        </DialogContent>
      </Dialog>
    );
  }

  // Show payment flow after connection
  if (connectionStatus === 'connected' && address) {
    const accountName = ensName ? formatENS(ensName) : formatAddress(address);

    return (
      <Dialog onClose={onClose} open={open} titleId={titleId}>
        <DialogContent bottomSheetOnMobile padding="0" wide>
          <Box display="flex" flexDirection="column">
            {/* Header */}
            <Box
              background="profileForeground"
              borderColor="generalBorder"
              borderStyle="solid"
              borderWidth="0"
              style={{ borderBottomWidth: '1px' }}
              padding="16"
            >
              <Box
                display="flex"
                flexDirection="row"
                justifyContent="space-between"
                alignItems="center"
              >
                <Box display="flex" alignItems="center" gap="8">
                  {merchantLogo && (
                    <AsyncImage
                      alt={merchantName}
                      src={merchantLogo}
                      width="32"
                      height="32"
                      borderRadius="menuButton"
                    />
                  )}
                  <Box display="flex" flexDirection="column">
                    <Text color="modalText" size="16" weight="heavy">
                      {activeView === 'success'
                        ? 'Payment Complete'
                        : activeView === 'confirm'
                          ? 'Confirm Payment'
                          : activeView === 'payment'
                            ? 'Select Rate'
                            : 'Select Payment Method'}
                    </Text>
                    {paymentConfig && (
                      <Text
                        color="modalTextSecondary"
                        size="12"
                        weight="medium"
                      >
                        {merchantName} • ${paymentAmount.toFixed(2)}{' '}
                        {paymentCurrency}
                      </Text>
                    )}
                  </Box>
                </Box>
                <CloseButton onClose={onClose} />
              </Box>
            </Box>

            {/* Content based on active view */}
            {activeView === 'assets' && (
              <Box padding="16">
                {/* Portfolio Summary */}
                <Box
                  background="generalBorder"
                  borderRadius="menuButton"
                  padding="12"
                  marginBottom="16"
                >
                  <Box display="flex" flexDirection="column" gap="4">
                    <Text color="modalTextSecondary" size="12" weight="medium">
                      Total Portfolio Value
                    </Text>
                    <Text color="modalText" size="20" weight="heavy">
                      ${totalPortfolioValue.toFixed(2)}
                    </Text>
                    <Text color="accentColor" size="12" weight="medium">
                      {accountName}
                    </Text>
                  </Box>
                </Box>

                {/* Assets List */}
                <Box display="flex" flexDirection="column" gap="8">
                  <Box marginBottom="8">
                    <Text color="modalText" size="14" weight="bold">
                      Pay with any asset • Best rates guaranteed
                    </Text>
                  </Box>

                  {/* Tokens */}
                  <Text color="modalTextSecondary" size="12" weight="bold">
                    TOKENS
                  </Text>
                  {userAssets
                    .filter((a) => a.type === 'token')
                    .map((asset, idx) => (
                      <Box
                        key={idx}
                        as="button"
                        onClick={() => handleAssetSelect(asset)}
                        alignItems="center"
                        background="generalBorder"
                        borderRadius="menuButton"
                        className={touchableStyles({ active: 'shrink' })}
                        display="flex"
                        justifyContent="space-between"
                        padding="12"
                        transition="default"
                        style={{
                          width: '100%',
                          border: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        <Box display="flex" alignItems="center" gap="12">
                          {asset.imageUrl && (
                            <AsyncImage
                              alt={asset.name}
                              src={asset.imageUrl}
                              width="32"
                              height="32"
                              borderRadius="full"
                            />
                          )}
                          <Box
                            display="flex"
                            flexDirection="column"
                            alignItems="flex-start"
                            gap="2"
                          >
                            <Text color="modalText" size="14" weight="bold">
                              {asset.symbol}
                            </Text>
                            <Text color="modalTextSecondary" size="12">
                              {asset.balance} • ${asset.value?.toFixed(2)}
                            </Text>
                          </Box>
                        </Box>
                        <Box
                          background="accentColor"
                          borderRadius="menuButton"
                          paddingX="8"
                          paddingY="4"
                        >
                          <Text
                            color="accentColorForeground"
                            size="12"
                            weight="bold"
                          >
                            Pay
                          </Text>
                        </Box>
                      </Box>
                    ))}

                  {/* NFTs */}
                  <Text color="modalTextSecondary" size="12" weight="bold">
                    NFTs (Instant Liquidity)
                  </Text>
                  {userAssets
                    .filter((a) => a.type === 'nft')
                    .map((asset, idx) => (
                      <Box
                        key={idx}
                        as="button"
                        onClick={() => handleAssetSelect(asset)}
                        alignItems="center"
                        background="generalBorder"
                        borderRadius="menuButton"
                        className={touchableStyles({ active: 'shrink' })}
                        display="flex"
                        justifyContent="space-between"
                        padding="12"
                        transition="default"
                        style={{
                          width: '100%',
                          border: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        <Box display="flex" alignItems="center" gap="12">
                          {asset.imageUrl && (
                            <AsyncImage
                              alt={asset.name}
                              src={asset.imageUrl}
                              width="40"
                              height="40"
                              borderRadius="menuButton"
                            />
                          )}
                          <Box
                            display="flex"
                            flexDirection="column"
                            alignItems="flex-start"
                            gap="2"
                          >
                            <Text color="modalText" size="14" weight="bold">
                              {asset.name}
                            </Text>
                            <Text color="modalTextSecondary" size="12">
                              Floor: {asset.floorPrice} ETH • $
                              {asset.value?.toFixed(2)}
                            </Text>
                          </Box>
                        </Box>
                        <Box
                          background="accentColor"
                          borderRadius="menuButton"
                          paddingX="8"
                          paddingY="4"
                        >
                          <Text
                            color="accentColorForeground"
                            size="12"
                            weight="bold"
                          >
                            Sell & Pay
                          </Text>
                        </Box>
                      </Box>
                    ))}
                </Box>
              </Box>
            )}

            {activeView === 'payment' && selectedAsset && (
              <Box padding="16">
                {/* Selected Asset */}
                <Box
                  background="generalBorder"
                  borderRadius="menuButton"
                  padding="12"
                  marginBottom="16"
                >
                  <Box display="flex" alignItems="center" gap="12">
                    {selectedAsset.imageUrl && (
                      <AsyncImage
                        alt={selectedAsset.name}
                        src={selectedAsset.imageUrl}
                        width="40"
                        height="40"
                        borderRadius={
                          selectedAsset.type === 'nft' ? 'menuButton' : 'full'
                        }
                      />
                    )}
                    <Box display="flex" flexDirection="column" gap="2">
                      <Text color="modalText" size="16" weight="bold">
                        Paying with {selectedAsset.name}
                      </Text>
                      <Text color="modalTextSecondary" size="12">
                        Balance: {selectedAsset.balance} {selectedAsset.symbol}
                      </Text>
                    </Box>
                  </Box>
                </Box>

                {/* Conversion Rates */}
                <Box display="flex" flexDirection="column" gap="8">
                  <Text color="modalText" size="14" weight="bold">
                    Live Conversion Rates
                  </Text>

                  {conversionRates.map((rate, idx) => (
                    <Box
                      key={idx}
                      as="button"
                      onClick={() => setSelectedRate(rate)}
                      alignItems="center"
                      background={
                        selectedRate === rate ? 'accentColor' : 'generalBorder'
                      }
                      borderRadius="menuButton"
                      className={touchableStyles({ active: 'shrink' })}
                      display="flex"
                      justifyContent="space-between"
                      padding="12"
                      transition="default"
                      style={{
                        width: '100%',
                        border: selectedRate === rate ? '2px solid' : 'none',
                        borderColor:
                          selectedRate === rate
                            ? 'var(--rk-colors-accentColor)'
                            : 'transparent',
                        cursor: 'pointer',
                      }}
                    >
                      <Box
                        display="flex"
                        flexDirection="column"
                        alignItems="flex-start"
                        gap="2"
                      >
                        <Text
                          color={
                            selectedRate === rate
                              ? 'accentColorForeground'
                              : 'modalText'
                          }
                          size="14"
                          weight="bold"
                        >
                          {rate.provider}
                        </Text>
                        <Text
                          color={
                            selectedRate === rate
                              ? 'accentColorForeground'
                              : 'modalTextSecondary'
                          }
                          size="12"
                        >
                          1 {rate.fromAsset} = {rate.rate.toFixed(2)}{' '}
                          {rate.toAsset}
                        </Text>
                      </Box>
                      <Box
                        display="flex"
                        flexDirection="column"
                        alignItems="flex-end"
                        gap="2"
                      >
                        <Text
                          color={
                            selectedRate === rate
                              ? 'accentColorForeground'
                              : 'modalText'
                          }
                          size="14"
                          weight="bold"
                        >
                          You receive: $
                          {(
                            (paymentAmount /
                              (selectedAsset.value! / paymentAmount)) *
                            rate.rate
                          ).toFixed(2)}
                        </Text>
                        <Text
                          color={
                            selectedRate === rate
                              ? 'accentColorForeground'
                              : 'modalTextSecondary'
                          }
                          size="12"
                        >
                          Slippage: {rate.slippage}%
                        </Text>
                      </Box>
                    </Box>
                  ))}
                </Box>

                {/* Action Buttons */}
                <Box display="flex" gap="8" marginTop="16">
                  <Box>
                    <ActionButton
                      label="Back"
                      onClick={() => setActiveView('assets')}
                      size="large"
                    />
                  </Box>
                  <Box>
                    <ActionButton
                      label="Continue"
                      onClick={() => setActiveView('confirm')}
                      size="large"
                    />
                  </Box>
                </Box>
              </Box>
            )}

            {activeView === 'confirm' && selectedAsset && selectedRate && (
              <Box padding="16">
                <Box display="flex" flexDirection="column" gap="16">
                  {/* Summary */}
                  <Box
                    background="generalBorder"
                    borderRadius="menuButton"
                    padding="16"
                  >
                    <Text color="modalText" size="16" weight="bold">
                      Payment Summary
                    </Text>

                    <Box display="flex" flexDirection="column" gap="8">
                      <Box display="flex" justifyContent="space-between">
                        <Text color="modalTextSecondary" size="14">
                          Merchant
                        </Text>
                        <Text color="modalText" size="14" weight="medium">
                          {merchantName}
                        </Text>
                      </Box>
                      <Box display="flex" justifyContent="space-between">
                        <Text color="modalTextSecondary" size="14">
                          Amount
                        </Text>
                        <Text color="modalText" size="14" weight="medium">
                          ${paymentAmount.toFixed(2)}
                        </Text>
                      </Box>
                      <Box display="flex" justifyContent="space-between">
                        <Text color="modalTextSecondary" size="14">
                          Paying with
                        </Text>
                        <Text color="modalText" size="14" weight="medium">
                          {selectedAsset.name}
                        </Text>
                      </Box>
                      <Box display="flex" justifyContent="space-between">
                        <Text color="modalTextSecondary" size="14">
                          Exchange via
                        </Text>
                        <Text color="modalText" size="14" weight="medium">
                          {selectedRate.provider}
                        </Text>
                      </Box>
                      <Box display="flex" justifyContent="space-between">
                        <Text color="modalTextSecondary" size="14">
                          Merchant receives
                        </Text>
                        <Text color="modalText" size="14" weight="medium">
                          {paymentAmount} USDC
                        </Text>
                      </Box>
                    </Box>
                  </Box>

                  {/* Action Buttons */}
                  <Box display="flex" gap="8">
                    <Box>
                      <ActionButton
                        label="Cancel"
                        onClick={() => setActiveView('payment')}
                        size="large"
                      />
                    </Box>
                    <Box>
                      <ActionButton
                        label={
                          isProcessing ? 'Processing...' : 'Confirm Payment'
                        }
                        onClick={processPayment}
                        disabled={isProcessing}
                        size="large"
                      />
                    </Box>
                  </Box>
                </Box>
              </Box>
            )}

            {activeView === 'success' && (
              <Box padding="16">
                <Box
                  display="flex"
                  flexDirection="column"
                  alignItems="center"
                  gap="16"
                >
                  {/* Success Icon */}
                  <Box
                    background="accentColor"
                    borderRadius="full"
                    padding="16"
                    style={{ width: '64px', height: '64px' }}
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                  >
                    <Text
                      color="accentColorForeground"
                      size="20"
                      weight="heavy"
                    >
                      ✓
                    </Text>
                  </Box>

                  <Box
                    display="flex"
                    flexDirection="column"
                    alignItems="center"
                    gap="4"
                  >
                    <Text color="modalText" size="20" weight="heavy">
                      Payment Successful!
                    </Text>
                    <Text
                      color="modalTextSecondary"
                      size="14"
                      textAlign="center"
                    >
                      ${paymentAmount.toFixed(2)} has been sent to{' '}
                      {merchantName}
                    </Text>
                  </Box>

                  {/* Transaction Details */}
                  <Box
                    background="generalBorder"
                    borderRadius="menuButton"
                    padding="12"
                    style={{ width: '100%' }}
                  >
                    <Box display="flex" flexDirection="column" gap="8">
                      <Text color="modalTextSecondary" size="12">
                        Transaction Hash
                      </Text>
                      <Text
                        color="modalText"
                        size="12"
                        weight="medium"
                        style={{ wordBreak: 'break-all' }}
                      >
                        {txHash}
                      </Text>
                    </Box>
                  </Box>

                  <ActionButton label="Done" onClick={onClose} size="large" />
                </Box>
              </Box>
            )}
          </Box>
        </DialogContent>
      </Dialog>
    );
  }

  return null;
}

// FlexPayButton - The main entry point for merchants
export function FlexPayButton({
  merchantName = 'Demo Store',
  merchantLogo,
  amount = 99.99,
  currency = 'USD',
  description = 'Purchase',
  onPaymentComplete,
}: {
  merchantName?: string;
  merchantLogo?: string;
  amount?: number;
  currency?: string;
  description?: string;
  onPaymentComplete?: (txHash: string) => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const connectionStatus = useConnectionStatus();
  const { i18n: _i18n2 } = useContext(I18nContext);

  const paymentConfig: FlexPayConfig = {
    merchantName,
    merchantLogo,
    amount,
    currency,
    description,
    preferredStablecoin: 'USDC',
  };

  const handlePaymentComplete = (txHash: string) => {
    console.log('Payment completed:', txHash);
    if (onPaymentComplete) {
      onPaymentComplete(txHash);
    }
  };

  return (
    <>
      <ConnectButtonRenderer>
        {({ account, chain, mounted }) => {
          const ready = mounted && connectionStatus !== 'loading';
          const connected =
            account && chain && connectionStatus === 'connected';

          return (
            <Box
              display="flex"
              gap="12"
              {...(!ready && {
                'aria-hidden': true,
                style: {
                  opacity: 0,
                  pointerEvents: 'none',
                  userSelect: 'none',
                },
              })}
            >
              {ready && (
                <Box
                  as="button"
                  background="accentColor"
                  borderRadius="connectButton"
                  boxShadow="connectButton"
                  className={touchableStyles({
                    active: 'shrink',
                    hover: 'grow',
                  })}
                  color="accentColorForeground"
                  fontFamily="body"
                  fontWeight="bold"
                  onClick={() => setModalOpen(true)}
                  paddingX="20"
                  paddingY="12"
                  testId="flexpay-button"
                  transition="default"
                  type="button"
                  display="flex"
                  alignItems="center"
                  gap="8"
                >
                  <Text size="16" weight="bold" color="accentColorForeground">
                    {connected
                      ? `Pay $${amount.toFixed(2)}`
                      : 'Pay with Crypto'}
                  </Text>
                  {connected && (
                    <Box
                      background="accentColorForeground"
                      borderRadius="full"
                      padding="2"
                      style={{ opacity: 0.2 }}
                    >
                      <Avatar
                        address={account.address}
                        imageUrl={account.ensAvatar}
                        size={16}
                      />
                    </Box>
                  )}
                </Box>
              )}
            </Box>
          );
        }}
      </ConnectButtonRenderer>

      {/* Enhanced Connect Modal with Payment Flow */}
      <EnhancedConnectModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        paymentConfig={paymentConfig}
        onPaymentComplete={handlePaymentComplete}
      />
    </>
  );
}

// Export the modal separately if needed
export { EnhancedConnectModal as FlexPayModal };
