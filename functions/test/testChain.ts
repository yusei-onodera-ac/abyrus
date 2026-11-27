/**
 * 試験用の「Apple のまね」: 自作のルート・中間・葉の証明書の鎖と、それで署名した取引 (JWS) を作る。
 * Apple のサーバーにも、本物のルート証明書にも、つながらない。SignedDataVerifier が見る決まり
 * (葉と中間の、Apple 独自の拡張 OID、鎖の長さ 3、中間が CA、日付) を、同じに作ってある。
 */
import { createSign, generateKeyPairSync, type KeyObject } from 'node:crypto';
import { KJUR } from 'jsrsasign';

/** Apple の葉 (レシート署名) と中間 (WWDR) の証明書にだけ付いている、Apple 独自の拡張。SignedDataVerifier が、あるかを見る。 */
export const OID_LEAF = '1.2.840.113635.100.6.11.1';
export const OID_INTERMEDIATE = '1.2.840.113635.100.6.2.1';

export interface Key {
  privatePem: string;
  publicPem: string;
  privateKey: KeyObject;
}

export function makeKey(): Key {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  return { privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), publicPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(), privateKey };
}

export interface CertOptions {
  subject: string;
  issuer: string;
  key: Key;
  signer: Key;
  ca?: boolean;
  /** 付ける Apple 独自の拡張 (OID)。 */
  appleOid?: string;
  notBefore?: string;
  notAfter?: string;
  /** OCSP の問い合わせ先 (onlineChecks の試験用)。 */
  ocspUrl?: string;
  serial?: number;
}

/** 日付は 'YYMMDDhhmmssZ' ではなく 'YYYYMMDDhhmmssZ' (jsrsasign の書き方)。 */
export function makeCertPem(o: CertOptions): string {
  const ext: { extname: string; [key: string]: unknown }[] = [];
  if (o.ca) ext.push({ extname: 'basicConstraints', critical: true, cA: true });
  else ext.push({ extname: 'basicConstraints', cA: false });
  if (o.appleOid) ext.push({ extname: o.appleOid, extn: '0500' });
  if (o.ocspUrl) ext.push({ extname: 'authorityInfoAccess', array: [{ ocsp: o.ocspUrl }] });
  const cert = new KJUR.asn1.x509.Certificate({
    version: 3,
    serial: { int: o.serial ?? Math.floor(Math.random() * 1e9) + 1 },
    issuer: { str: `/CN=${o.issuer}` },
    subject: { str: `/CN=${o.subject}` },
    notbefore: o.notBefore ?? '20200101000000Z',
    notafter: o.notAfter ?? '20400101000000Z',
    sbjpubkey: o.key.publicPem,
    ext,
    sigalg: 'SHA256withECDSA',
    cakey: o.signer.privatePem,
  });
  return cert.getPEM();
}

export const pemToDer = (pem: string): Buffer => Buffer.from(pem.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, ''), 'base64');

export interface Chain {
  rootDer: Buffer;
  /** x5c に入れる順: 葉・中間・ルート (base64 の DER)。 */
  x5c: string[];
  leafKey: Key;
}

export interface ChainOptions {
  /** 葉に Apple の拡張を付けない。 */
  noLeafOid?: boolean;
  noIntermediateOid?: boolean;
  /** 葉の有効期限。 */
  leafNotAfter?: string;
  /** 葉と中間の OCSP の問い合わせ先 (onlineChecks の試験用)。 */
  ocspUrl?: string;
}

/** ルート -> 中間 -> 葉 を作る。 */
export function makeChain(options: ChainOptions = {}): Chain {
  const rootKey = makeKey();
  const midKey = makeKey();
  const leafKey = makeKey();
  const root = makeCertPem({ subject: 'Test Root CA', issuer: 'Test Root CA', key: rootKey, signer: rootKey, ca: true });
  const mid = makeCertPem({ subject: 'Test Intermediate CA', issuer: 'Test Root CA', key: midKey, signer: rootKey, ca: true, appleOid: options.noIntermediateOid ? undefined : OID_INTERMEDIATE, ocspUrl: options.ocspUrl });
  const leaf = makeCertPem({
    subject: 'Test Receipt Signer',
    issuer: 'Test Intermediate CA',
    key: leafKey,
    signer: midKey,
    appleOid: options.noLeafOid ? undefined : OID_LEAF,
    notAfter: options.leafNotAfter,
    ocspUrl: options.ocspUrl,
  });
  return { rootDer: pemToDer(root), x5c: [pemToDer(leaf).toString('base64'), pemToDer(mid).toString('base64'), pemToDer(root).toString('base64')], leafKey };
}

const b64url = (data: Buffer | string): string => Buffer.from(data).toString('base64url');

/** JWS (ES256) を作る。header の x5c は、鎖を入れる (試験では、わざと壊したものも渡す)。 */
export function signJws(payload: Record<string, unknown>, key: Key, x5c: string[], header: Record<string, unknown> = {}): string {
  const head = b64url(JSON.stringify({ alg: 'ES256', typ: 'JWT', x5c, ...header }));
  const body = b64url(JSON.stringify(payload));
  const signature = createSign('SHA256').update(`${head}.${body}`).sign({ key: key.privateKey, dsaEncoding: 'ieee-p1363' });
  return `${head}.${body}.${b64url(signature)}`;
}

export interface TransactionOptions {
  bundleId?: string;
  environment?: 'Sandbox' | 'Production';
  productId?: string;
  transactionId?: string | null;
  type?: string;
  revoked?: boolean;
  signedDate?: number;
}

/** StoreKit 2 の取引の中身 (JWSTransactionDecodedPayload のうち、確かめる部分)。 */
export function transactionPayload(o: TransactionOptions = {}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    transactionId: o.transactionId === null ? undefined : (o.transactionId ?? String(2_000_000_000_000 + Math.floor(Math.random() * 1e9))),
    originalTransactionId: '2000000000000001',
    bundleId: o.bundleId ?? 'app.test.game',
    productId: o.productId ?? 'gems_160',
    purchaseDate: 1_800_000_000_000,
    quantity: 1,
    type: o.type ?? 'Consumable',
    inAppOwnershipType: 'PURCHASED',
    signedDate: o.signedDate ?? 1_800_000_000_500,
    environment: o.environment ?? 'Sandbox',
    storefront: 'JPN',
  };
  if (o.revoked) {
    payload.revocationDate = 1_800_000_100_000;
    payload.revocationReason = 0;
  }
  return payload;
}
