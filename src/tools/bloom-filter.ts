/**
 * 布隆过滤器实现
 * 用于高效判断字符串key是否可能存在于集合中
 * 特点：可能存在误报(false positive)，但绝不会误漏(false negative)
 */
export class BloomFilter {
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
    this.bitArray = new Uint8Array(size);
    this.hashFunctions = this.generateHashFunctions(hashCount);
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
      this.bitArray[index] = 1;
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
      if (this.bitArray[index] === 0) {
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
   * 估算当前布隆过滤器中的元素数量
   * 注意：这是一个近似值，实际数量可能有所不同
   */
  public estimateCount(): number {
    const ones = this.bitArray.reduce((sum, bit) => sum + bit, 0);
    if (ones === 0) return 0;
    
    const m = this.size;
    const k = this.hashFunctions.length;
    const n = -m / k * Math.log(1 - ones / m);
    
    return Math.max(0, Math.round(n));
  }
}