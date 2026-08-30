/**
 * 布隆过滤器实现
 * 用于高效判断字符串key是否可能存在于集合中
 * 特点：可能存在误报(false positive)，但绝不会误漏(false negative)
 */
export class BloomFilter {
  /**
   * 位数组底层存储在字节容器中，每个字节承载 8 位（bit）。
   * 容量为 ceil(size / 8)，set/get 通过 index % 8 与 &、| 位运算操作。
   */
  private bitArray: Uint8Array;
  private size: number;
  private hashFunctions: ((key: string) => number)[];

  /**
   * 创建布隆过滤器实例
   * @param size 位数组大小（建议为预期元素数量的2-3倍）
   * @param hashCount 哈希函数数量（通常3-5个）
   */
  constructor(size: number = 1000, hashCount: number = 3) {
    this.size = size;
    // 每 8 位压缩为 1 个字节，因此底层字节数组长度为 ceil(size / 8)
    this.bitArray = new Uint8Array(Math.ceil(size / 8));
    this.hashFunctions = this.generateHashFunctions(hashCount);
  }

  /**
   * 根据预期元素数和目标误判率创建布隆过滤器
   * 参考公式：
   *   m = -n * ln(p) / (ln 2)^2   （最优位数组长度）
   *   k = (m / n) * ln 2 ≈ 0.693 * m / n  （最优哈希函数数量）
   * @param expectedItems 预期元素数量 n
   * @param falsePositiveRate 目标误判率 p（0 < p < 1，如 0.01 表示 1%）
   */
  public static create(expectedItems: number, falsePositiveRate = 0.01): BloomFilter {
    if (!Number.isFinite(expectedItems) || expectedItems <= 0) {
      throw new Error('expectedItems 必须为正数');
    }
    if (!Number.isFinite(falsePositiveRate) || falsePositiveRate <= 0 || falsePositiveRate >= 1) {
      throw new Error('falsePositiveRate 必须在 (0, 1) 之间');
    }

    const ln2 = Math.LN2;
    // 最优位数组长度 m = -n * ln(p) / (ln 2)^2，向上取整，最小为 1
    const m = Math.max(1, Math.ceil((-expectedItems * Math.log(falsePositiveRate)) / (ln2 * ln2)));
    // 最优哈希函数数量 k = (m / n) * ln 2，向上取整，最小为 1
    const k = Math.max(1, Math.ceil((m / expectedItems) * ln2));

    return new BloomFilter(m, k);
  }

  /**
   * 生成指定数量的哈希函数
   * 使用简单的多项式滚动哈希，通过不同的基数来创建多个独立的哈希函数
   */
  private generateHashFunctions(count: number): ((key: string) => number)[] {
    const functions: ((key: string) => number)[] = [];
    
    // 使用不同的质数作为基数
    const bases = [31, 37, 41, 43, 47, 53, 59, 61, 67, 71];
    
    for (let i = 0; i < count && i < bases.length; i++) {
      const base = bases[i];
      functions.push((key: string) => {
        let hash = 0;
        for (let j = 0; j < key.length; j++) {
          hash = (hash * base + key.charCodeAt(j)) % this.size;
        }
        return Math.abs(hash) % this.size;
      });
    }
    
    return functions;
  }

  /**
   * 向布隆过滤器中添加一个key
   * @param key 要添加的字符串key
   */
  public add(key: string): void {
    if (typeof key !== 'string') {
      throw new Error('Key must be a string');
    }
    
    for (const hashFn of this.hashFunctions) {
      const index = hashFn(key);
      // 定位字节与字节内位偏移，通过 | 置位
      const byteIndex = index >> 3;       // 相当于 Math.floor(index / 8)
      const bitOffset = index % 8;        // 字节内位偏移
      this.bitArray[byteIndex] |= (1 << bitOffset);
    }
  }

  /**
   * 检查key是否可能存在于布隆过滤器中
   * @param key 要检查的字符串key
   * @returns true表示key可能存在，false表示key一定不存在
   */
  public mightContain(key: string): boolean {
    if (typeof key !== 'string') {
      return false;
    }
    
    for (const hashFn of this.hashFunctions) {
      const index = hashFn(key);
      const byteIndex = index >> 3;
      const bitOffset = index % 8;
      // 通过 & 读取对应位是否为 0
      if ((this.bitArray[byteIndex] & (1 << bitOffset)) === 0) {
        return false; // 如果任何一个位是0，则key一定不存在
      }
    }
    
    return true; // 所有位都是1，key可能存在
  }

  /**
   * 清空布隆过滤器
   */
  public clear(): void {
    this.bitArray.fill(0);
  }

  /**
   * 获取布隆过滤器的大小（位数组长度）
   */
  public getSize(): number {
    return this.size;
  }

  /**
   * 获取哈希函数的数量
   */
  public getHashFunctionCount(): number {
    return this.hashFunctions.length;
  }

  /**
   * SWAR（SIMD Within A Register）位计数：统计单个字节中置位(bits)的总数。
   * 参考算法（8 位版，各字节之间由外层循环累加求和）：
   *   x = (x & 0b01010101) + ((x >>> 1) & 0b01010101)   // 每 2 位一组求和
   *   x = (x & 0b00110011) + ((x >>> 2) & 0b00110011)   // 每 4 位一组求和
   *   x = (x & 0b00001111) + ((x >>> 4) & 0b00001111)   // 每 8 位一组求和
   *   返回 0~8
   */
  private static popcountByte(x: number): number {
    x = (x & 0b01010101) + ((x >>> 1) & 0b01010101);
    x = (x & 0b00110011) + ((x >>> 2) & 0b00110011);
    x = (x & 0b00001111) + ((x >>> 4) & 0b00001111);
    return x;
  }

  /**
   * SWAR 位计数：统计整个位数组中置位(bits)的总数。
   * 每个字节做一次 SWAR 位计数，各字节之间通过循环累加求和。
   */
  private countBits(): number {
    const { bitArray } = this;
    let total = 0;
    for (let i = 0; i < bitArray.length; i++) {
      total += BloomFilter.popcountByte(bitArray[i]);
    }
    return total;
  }

  /**
   * 估算当前布隆过滤器中的元素数量
   * 注意：这是一个近似值，实际数量可能有所不同
   */
  public estimateCount(): number {
    const ones = this.countBits();
    if (ones === 0) return 0;
    
    const m = this.size;
    const k = this.hashFunctions.length;
    const n = -m / k * Math.log(1 - ones / m);
    
    return Math.max(0, Math.round(n));
  }
}