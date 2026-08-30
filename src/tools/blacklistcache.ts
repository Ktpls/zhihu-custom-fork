import { BloomFilter } from './bloom-filter';

export class BlacklistCache<T = any> {
  private map: Map<string, T> | null = null;
  private bloom: BloomFilter | null = null;
  //布隆过滤器用于快速判不存在，命中后再回退到 map 精确确认

  // 函数变量（在构造函数当中传入并赋值）
  private key_getter: (item: T) => string;
  private get_all: () => Promise<T[]>;

  /**
   * 构造函数
   * @param key_getter 从元素类型T当中获取它的key
   * @param get_all 获取所有元素的异步函数
   */
  constructor(key_getter: (item: T) => string, get_all: () => Promise<T[]>) {
    this.key_getter = key_getter;
    this.get_all = get_all;
  }

  /**
   * 确保缓存已构建
   * 检查map和bloom是否为null，如果是则调用rebuild
   */
  public async ensureCacheBuilt(): Promise<void> {
    if (this.map === null || this.bloom === null) {
      await this.rebuild();
    }
  }

  /**
   * 添加元素
   * 根据要添加的元素获取key
   * 将key添加到布隆过滤器
   * 将元素添加到map中
   */
  public async add(item: T): Promise<void> {
    await this.ensureCacheBuilt();
    const key = this.key_getter(item);
    this.bloom!.add(key);
    this.map!.set(key, item);
  }

  /**
   * 删除元素
   * 获取key
   * 将元素从map中删除
   * 不考虑布隆过滤器（布隆过滤器不支持删除操作）
   */
  public async remove(item: T): Promise<void> {
    await this.ensureCacheBuilt();
    const key = this.key_getter(item);
    this.map!.delete(key);
    // 注意：布隆过滤器不支持删除操作，所以这里不处理布隆过滤器
  }

  /**
   * 使缓存失效
   * 将map和bloom置空，下次查询时通过ensureCacheBuilt自动重建
   */
  public async invalidate(): Promise<void> {
    this.map = null;
    this.bloom = null;
  }

  /**
   * 重建
   * 清空布隆过滤器和map
   * 获取所有元素
   * 根据元素数量按预期误判率(1%)重创建布隆过滤器
   * 将所有元素添加
   */
  public async rebuild(): Promise<void> {
    // 获取所有元素（先取数据，以便确定预期元素数）
    const allItems = await this.get_all();

    // 清空现有数据
    this.map = new Map<string, T>();
    // 根据预期元素数创建布隆过滤器（默认误判率 1%）
    this.bloom = BloomFilter.create(Math.max(allItems.length, 1));

    // 将所有元素添加到缓存中
    for (const item of allItems) {
      const key = this.key_getter(item);
      this.bloom!.add(key);
      this.map.set(key, item);
    }
  }

  /**
   * 判断元素是否存在
   */
  public async exist(item: T): Promise<boolean> {
    const key = this.key_getter(item);
    return this.key_exist(key);
  }

  /**
   * 判断指定的key是否存在
   * 先用布隆过滤器快速判断（可能误报但不误漏）
   * 布隆过滤器说可能存在，需要在map中确认
   */
  public async key_exist(key: string): Promise<boolean> {
    await this.ensureCacheBuilt();
    // 先用布隆过滤器快速判断（布隆过滤器可能有误报但绝不会误漏）
    if (!this.bloom!.mightContain(key)) {
      return false; // 布隆过滤器说一定不存在
    }

    // 布隆过滤器说可能存在，需要在map中确认
    return this.map!.has(key);
  }

  /**
   * 根据指定的key获取对应的元素
   * @param key 要查找的key
   * @returns 对应的元素，如果不存在则返回undefined
   */
  public async get(key: string): Promise<T | undefined> {
    await this.ensureCacheBuilt();
    return this.map!.get(key);
  }
}