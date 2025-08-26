/**
 * 通用缓存类
 * 提供缓存生成、失效和获取功能
 */
export class Cache<T = any> {
  private cache: T | null = null;
  private loader: () => Promise<T>;

  /**
   * 创建缓存实例
   * @param loader 用于加载数据的函数
   */
  constructor(loader: () => Promise<T>) {
    this.loader = loader;
  }

  /**
   * 获取缓存数据
   * 如果缓存不存在，则通过loader函数加载数据并生成缓存
   */
  async get(): Promise<T> {
    if (this.cache === null) {
      this.cache = await this.loader();
    }
    return this.cache;
  }

  /**
   * 使缓存失效
   * 下次获取时将重新加载数据
   */
  invalidate(): void {
    this.cache = null;
  }

  /**
   * 更新缓存数据
   * @param data 新的缓存数据
   */
  set(data: T): void {
    this.cache = data;
  }
}