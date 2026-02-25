import { BloomFilter } from './bloom-filter';

export class BlacklistCache<T = any> {
  private map: Map<string, T>;
  private bloom: BloomFilter;
  
  // 函数变量（在构造函数当中传入并赋值）
  private key_getter: (item: T) => string;
  private get_all: () => Promise<T[]>;

  /**
   * 构造函数
   * @param key_getter 从元素类型T当中获取它的key
   * @param get_all 获取所有元素的异步函数
   */
  constructor(key_getter: (item: T) => string, get_all: () => Promise<T[]>) {
    this.map = new Map<string, T>();
    this.bloom = new BloomFilter(1000, 3);
    this.key_getter = key_getter;
    this.get_all = get_all;
  }

  /**
   * 添加元素
   * 根据要添加的元素获取key
   * 将key添加到布隆过滤器
   * 将元素添加到map中
   */
  public add(item: T): void {
    const key = this.key_getter(item);
    this.bloom.add(key);
    this.map.set(key, item);
  }

  /**
   * 删除元素
   * 获取key
   * 将元素从map中删除
   * 不考虑布隆过滤器（布隆过滤器不支持删除操作）
   */
  public remove(item: T): void {
    const key = this.key_getter(item);
    this.map.delete(key);
    // 注意：布隆过滤器不支持删除操作，所以这里不处理布隆过滤器
  }

  /**
   * 重建
   * 清空布隆过滤器和map
   * 获取所有元素
   * 根据max(元素数*3, 1000)重创建布隆过滤器
   * 将所有元素添加
   */
  public async rebuild(): Promise<void> {
    // 清空现有数据
    this.map.clear();
    this.bloom.clear();
    
    // 获取所有元素
    const allItems = await this.get_all();
    
    // 根据元素数量重新创建布隆过滤器
    const size = Math.max(allItems.length * 3, 1000);
    this.bloom = new BloomFilter(size, 3);
    
    // 将所有元素添加到缓存中
    for (const item of allItems) {
      this.add(item);
    }
  }

  /**
   * 判断元素是否存在
   * 获取key
   * 判断key是否存在于布隆过滤器中，若不存在则返回不存在
   * 判断元素是否在map中，若不存在则返回不存在
   */
  public exist(item: T): boolean {
    const key = this.key_getter(item);
    
    // 先用布隆过滤器快速判断
    if (!this.bloom.mightContain(key)) {
      return false; // 一定不存在
    }
    
    // 布隆过滤器说可能存在，需要在map中确认
    return this.map.has(key);
  }
}