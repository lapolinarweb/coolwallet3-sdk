import { sign } from "../crypto/sign";
import { aes256CbcDecrypt } from "../crypto/encryptions";
import * as signatureTools from "../crypto/signature";
import COMMAND from "../config/command";
import * as apdu from "../apdu/index";
import { getCommandSignature } from "./auth";

/**
 * get command signature for CoolWalletS
 * @param {String} txDataHex hex string data for SE
 * @param {String} txDataType hex P1 string
 * @param {String} appPrivateKey
 * @return {String} signature
 */
const signForCoolWallet = (txDataHex, txDataType, appPrivateKey) => {
  const command = COMMAND.TX_PREPARE;
  const P1 = txDataType;
  const P2 = "00";
  const prefix = command.CLA + command.INS + P1 + P2;
  const payload = prefix + txDataHex;
  const signatureBuffer = sign(Buffer.from(payload, "hex"), appPrivateKey);
  return signatureBuffer.toString("hex");
};

export const getEncryptedSignatureByScripts = async (
  transport,
  appId,
  appPrivKey,
  script,
  argument,
  txPrepareComplteCallback = null
) => {
  await apdu.tx.sendScript(transport, script);
  const { signature } = await getCommandSignature(
    transport,
    appId,
    appPrivKey,
    "EXECUTE_SCRIPT",
    argument,
    null,
    null
  );
  const encryptedSignature = await apdu.tx.executeScript(
    transport,
    argument,
    signature
  );
  await apdu.tx.finishPrepare(transport);

  if (typeof txPrepareComplteCallback === "function")
    txPrepareComplteCallback();
  return encryptedSignature;
};

/**
 * get command signature for CoolWalletS
 * @param {Transport} transport
 * @param {String} txDataHex hex string data for SE
 * @param {String} txDataType hex P1 string
 * @param {String} appPrivateKey
 * @return {String} signature
 */
const prepareTx = async (transport, txDataHex, txDataType, appPrivateKey) => {
  let encryptedSignature;
  const sendData =
    txDataHex + signForCoolWallet(txDataHex, txDataType, appPrivateKey);
  const patch = Math.ceil(sendData.length / 500);
  for (let i = 0; i < patch; i++) {
    const patchData = sendData.substr(i * 500, 500);
    const p2 = patch === 1 ? "00" : (i === patch - 1 ? "8" : "0") + (i + 1);
    // eslint-disable-next-line no-await-in-loop
    encryptedSignature = await apdu.tx.prepTx(
      transport,
      patchData,
      txDataType,
      p2
    );
  }
  return encryptedSignature;
};

/**
 * do TX_PREP and get encrypted signature.
 * @param {Transport} transport
 * @param {String} txDataHex
 * @param {String} txDataType
 * @param {String} appPrivateKey
 * @param {Function} txPrepareCompleteCallback
 * @returns {Promise<String>} encryptedSignature
 */
export const getSingleEncryptedSignature = async (
  transport,
  txDataHex,
  txDataType,
  appPrivateKey,
  txPrepareCompleteCallback = null
) => {
  const encryptedSignature = await prepareTx(
    transport,
    txDataHex,
    txDataType,
    appPrivateKey
  );
  await apdu.tx.finishPrepare(transport);
  if (typeof txPrepareCompleteCallback === "function")
    txPrepareCompleteCallback();
  return encryptedSignature;
};

/**
 * Same as getSingleEncryptedSignature, but used for UTXO based coins to get array of sigs.
 * @param {Transport} transport
 * @param {Array<{txDataHex:String, txDataType:String}>} txDataArray
 * @param {String} appPrivateKey
 * @param {Function} txPrepareCompleteCallback
 * @returns {Promise<Array<String>>} array of encryptedSignature
 */
export const getEncryptedSignatures = async (
  transport,
  txDataArray,
  appPrivateKey,
  txPrepareCompleteCallback = null
) => {
  const encryptedSignatureArray = [];
  for (const txData of txDataArray) {
    const { txDataHex, txDataType } = txData;
    // eslint-disable-next-line no-await-in-loop
    const encryptedSignature = await prepareTx(
      transport,
      txDataHex,
      txDataType,
      appPrivateKey
    );
    encryptedSignatureArray.push(encryptedSignature);
  }
  await apdu.tx.finishPrepare(transport);
  if (typeof txPrepareCompleteCallback === "function")
    txPrepareCompleteCallback();
  return encryptedSignatureArray;
};

/**
 * get the key used to encrypt signatures
 * @param {Transport} transport
 * @param {Function} authorizedCallback
 * @returns {Promise<String>}
 */
export const getCWSEncryptionKey = async (transport, authorizedCallback) => {
  const success = await apdu.tx.getTxDetail(transport);
  if (!success) return undefined;

  if (typeof authorizedCallback === "function") authorizedCallback();

  const signatureKey = await apdu.tx.getSignatureKey(transport);

  await apdu.tx.clearTransaction(transport);
  await apdu.control.powerOff(transport);
  return signatureKey;
};

/**
 * @description Decrypt Data from CoolWallet
 * @param {String} encryptedSignature
 * @param {String} signatureKey
 * @param {Boolean} isEDDSA
 * @param {Boolean} returnCanonical
 * @return {{r:string, s:string} | string } canonical signature or DER signature
 */
export const decryptSignatureFromSE = (
  encryptedSignature,
  signatureKey,
  isEDDSA = false,
  returnCanonical = true
) => {
  const iv = Buffer.alloc(16);
  iv.fill(0);
  const derSigBuff = aes256CbcDecrypt(
    iv,
    Buffer.from(signatureKey, "hex"),
    encryptedSignature
  );

  if (isEDDSA) return derSigBuff;

  const sigObj = signatureTools.parseDERsignature(derSigBuff.toString("hex"));
  const canonicalSignature = signatureTools.getCanonicalSignature(sigObj);
  if (returnCanonical) return canonicalSignature;

  return signatureTools.convertToDER(canonicalSignature);
};

/**
 * @param {String} coinType
 * @param {String} Number
 */
export const addressIndexToKeyId = (coinType, addressIndex) => {
  const indexHex = addressIndex.toString(16).padStart(4, "0");
  const keyId = `${coinType}0000${indexHex}`;
  return keyId;
};
