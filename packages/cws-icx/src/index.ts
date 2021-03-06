import { ECDSACoin } from '@coolwallets/coin';
import * as icxSign from './sign';
import { pubKeyToAddress } from './util';

type Transport = import('@coolwallets/transport').default;

export default class ICX extends ECDSACoin {
  constructor(transport: Transport, appPrivateKey: string, appId: string) {
    super(transport, appPrivateKey, appId, '4A');
  }

  /**
   * Get ICON address by index
   */
  async getAddress(addressIndex: number): Promise<string> {
    const publicKey = await this.getPublicKey(addressIndex);
    return pubKeyToAddress(publicKey);
  }

  /**
   * Sign ICX Transaction.
   */
  async signTransaction(
    transaction: string | Object,
    addressIndex: number,
    publicKey: string | undefined = undefined,
    confirmCB: Function | undefined = undefined,
    authorizedCB: Function | undefined = undefined
  ) {
    if (publicKey === undefined) publicKey = await this.getPublicKey(addressIndex);
    return icxSign.signTransaction(
      this.transport,
      this.appId,
      this.appPrivateKey,
      this.coinType,
      transaction,
      addressIndex,
      publicKey,
      confirmCB,
      authorizedCB
    );
  }
}
