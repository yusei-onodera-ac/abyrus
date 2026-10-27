/**
 * Arbitrary-magnitude number for idle-RPG style growth (damage, gold, stats)
 * that must scale far beyond Number.MAX_SAFE_INTEGER (2^53).
 * Represented as mantissa * 10^exponent, with 1 <= |mantissa| < 10.
 */

interface UnitEntry {
  threshold: number;
  suffix: string;
}

const UNITS: UnitEntry[] = [
  { threshold: 0, suffix: '' },
  { threshold: 4, suffix: '万' },
  { threshold: 8, suffix: '億' },
  { threshold: 12, suffix: '兆' },
  { threshold: 16, suffix: '京' },
  { threshold: 20, suffix: '垓' },
  { threshold: 24, suffix: '秭' },
  { threshold: 28, suffix: '穣' },
  { threshold: 32, suffix: '溝' },
  { threshold: 36, suffix: '澗' },
  { threshold: 40, suffix: '正' },
  { threshold: 44, suffix: '載' },
  { threshold: 48, suffix: '極' },
  { threshold: 52, suffix: '恒河沙' },
  { threshold: 56, suffix: '阿僧祇' },
  { threshold: 60, suffix: '那由他' },
  { threshold: 64, suffix: '不可思議' },
  { threshold: 68, suffix: '無量大数' },
];

export class BigNumber {
  mantissa: number;
  exponent: number;

  constructor(mantissa: number, exponent = 0) {
    this.mantissa = mantissa;
    this.exponent = exponent;
    this.normalize();
  }

  static readonly ZERO = new BigNumber(0, 0);

  static from(value: number | BigNumber): BigNumber {
    if (value instanceof BigNumber) return new BigNumber(value.mantissa, value.exponent);
    if (value === 0 || !isFinite(value)) return new BigNumber(0, 0);
    const exponent = Math.floor(Math.log10(Math.abs(value)));
    return new BigNumber(value / Math.pow(10, exponent), exponent);
  }

  /** base^exp, computed via logarithms so it never overflows a double. */
  static pow(base: number, exp: number): BigNumber {
    if (exp === 0 || base === 1) return BigNumber.from(1);
    const total = exp * Math.log10(base);
    const exponent = Math.floor(total);
    const mantissa = Math.pow(10, total - exponent);
    return new BigNumber(mantissa, exponent);
  }

  private normalize(): void {
    if (this.mantissa === 0 || !isFinite(this.mantissa)) {
      this.mantissa = 0;
      this.exponent = 0;
      return;
    }
    const sign = this.mantissa < 0 ? -1 : 1;
    let m = Math.abs(this.mantissa);
    let e = this.exponent;
    const shift = Math.floor(Math.log10(m));
    m = m / Math.pow(10, shift);
    e += shift;
    while (m >= 10) {
      m /= 10;
      e += 1;
    }
    while (m < 1) {
      m *= 10;
      e -= 1;
    }
    this.mantissa = sign * m;
    this.exponent = e;
  }

  add(other: number | BigNumber): BigNumber {
    const b = BigNumber.from(other);
    if (this.mantissa === 0) return new BigNumber(b.mantissa, b.exponent);
    if (b.mantissa === 0) return new BigNumber(this.mantissa, this.exponent);
    const diff = this.exponent - b.exponent;
    if (diff > 15) return new BigNumber(this.mantissa, this.exponent);
    if (diff < -15) return new BigNumber(b.mantissa, b.exponent);
    if (diff >= 0) {
      return new BigNumber(this.mantissa + b.mantissa / Math.pow(10, diff), this.exponent);
    }
    return new BigNumber(b.mantissa + this.mantissa / Math.pow(10, -diff), b.exponent);
  }

  sub(other: number | BigNumber): BigNumber {
    const b = BigNumber.from(other);
    return this.add(new BigNumber(-b.mantissa, b.exponent));
  }

  mul(other: number | BigNumber): BigNumber {
    const b = BigNumber.from(other);
    return new BigNumber(this.mantissa * b.mantissa, this.exponent + b.exponent);
  }

  div(other: number | BigNumber): BigNumber {
    const b = BigNumber.from(other);
    if (b.mantissa === 0) throw new Error('BigNumber division by zero');
    return new BigNumber(this.mantissa / b.mantissa, this.exponent - b.exponent);
  }

  compare(other: number | BigNumber): -1 | 0 | 1 {
    const b = BigNumber.from(other);
    const aZero = this.mantissa === 0;
    const bZero = b.mantissa === 0;
    if (aZero && bZero) return 0;
    if (aZero) return b.mantissa > 0 ? -1 : 1;
    if (bZero) return this.mantissa > 0 ? 1 : -1;
    const aSign = this.mantissa > 0 ? 1 : -1;
    const bSign = b.mantissa > 0 ? 1 : -1;
    if (aSign !== bSign) return aSign > bSign ? 1 : -1;
    if (this.exponent !== b.exponent) {
      return ((this.exponent > b.exponent ? 1 : -1) * aSign) as -1 | 1;
    }
    if (this.mantissa === b.mantissa) return 0;
    return (this.mantissa > b.mantissa ? 1 : -1) as -1 | 1;
  }

  gt(other: number | BigNumber): boolean {
    return this.compare(other) > 0;
  }

  gte(other: number | BigNumber): boolean {
    return this.compare(other) >= 0;
  }

  lt(other: number | BigNumber): boolean {
    return this.compare(other) < 0;
  }

  lte(other: number | BigNumber): boolean {
    return this.compare(other) <= 0;
  }

  isZero(): boolean {
    return this.mantissa === 0;
  }

  toNumber(): number {
    return this.mantissa * Math.pow(10, this.exponent);
  }

  toString(): string {
    if (this.mantissa === 0) return '0';
    const sign = this.mantissa < 0 ? '-' : '';
    const absMantissa = Math.abs(this.mantissa);
    if (this.exponent < 4) {
      const value = absMantissa * Math.pow(10, this.exponent);
      return sign + Math.round(value).toLocaleString('ja-JP');
    }
    let unit: UnitEntry = UNITS[0];
    for (const u of UNITS) {
      if (this.exponent >= u.threshold) unit = u;
      else break;
    }
    const scaled = absMantissa * Math.pow(10, this.exponent - unit.threshold);
    const text = scaled >= 100 ? scaled.toFixed(0) : scaled.toFixed(1);
    return sign + text + unit.suffix;
  }

  toJSON(): [number, number] {
    return [this.mantissa, this.exponent];
  }

  static fromJSON(data: [number, number] | number | undefined): BigNumber {
    if (data === undefined) return BigNumber.ZERO;
    if (Array.isArray(data)) return new BigNumber(data[0], data[1]);
    return BigNumber.from(data);
  }
}
