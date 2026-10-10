import { BloomFilter } from './bloom-filter';

/** 黑名单缓存配置项（构建缓存时读取） */
export interface IBlacklistCacheSettings {
  /** 是否启用布隆过滤器缓存 */
  bloom: boolean;
  /** 是否启用 HashMap 缓存 */
  map: boolean;
}

export class BlacklistCache<T = any> {
  private map: Map<string, T> | null = null;
  private bloom: BloomFilter | null = null;
  //布隆过滤器用于快速判不存在，命中后再回退到 map 精确确认
  //允许 bloom 或 map 缓存不存在（为 null），查询时按 bloom -> map -> 黑名单 list 顺序逐级检查

  // 函数变量（在构造函数当中传入并赋值）
  private key_getter: (item: T) => string;
  private get_all: () => Promise<T[]>;
  private get_settings?: () => Promise<IBlacklistCacheSettings> | IBlacklistCacheSettings;
  // 标记缓存是否已构建（含按开关设置置空的情况），避免缓存全为 null 时每次查询都重建
  private built: boolean = false;

  /**
   * 构造函数
   * @param key_getter 从元素类型T当中获取它的key
   * @param get_all 获取所有元素的异步函数
   * @param get_settings 获取缓存开关配置的函数（可选，不传则默认全部启用）
   */
  constructor(key_getter: (item: T) => string, get_all: () => Promise<T[]>, get_settings?: () => Promise<IBlacklistCacheSettings> | IBlacklistCacheSettings) {
    this.key_getter = key_getter;
    this.get_all = get_all;
    this.get_settings = get_settings;
  }

  /**
   * 获取缓存开关配置
   * 未传入获取函数或获取出错时，默认全部启用
   */
  private async resolveSettings(): Promise<IBlacklistCacheSettings> {
    try {
      if (this.get_settings) {
        return await this.get_settings();
      }
    } catch {}
    return { bloom: true, map: true };
  }

  /**
   * 确保缓存已构建
   * built 为 true 表示已按开关设置完成构建（bloom 或 map 可能为 null），无需重建
   * built 为 false（初始或 invalidate 后）时调用 rebuild
   */
  public async ensureCacheBuilt(): Promise<void> {
    if (this.built) return;
    await this.rebuild();
  }

  /**
   * 添加元素
   * 根据要添加的元素获取key
   * 将key添加到布隆过滤器（若存在）
   * 将元素添加到map中（若存在）
   */
  public async add(item: T): Promise<void> {
    await this.ensureCacheBuilt();
    const key = this.key_getter(item);
    if (this.bloom !== null) this.bloom.add(key);
    if (this.map !== null) this.map.set(key, item);
  }

  /**
   * 删除元素
   * 获取key
   * 将元素从map中删除（若存在）
   * 不考虑布隆过滤器（布隆过滤器不支持删除操作）
   */
  public async remove(item: T): Promise<void> {
    await this.ensureCacheBuilt();
    const key = this.key_getter(item);
    if (this.map !== null) this.map.delete(key);
    // 注意：布隆过滤器不支持删除操作，所以这里不处理布隆过滤器
  }

  /**
   * 使缓存失效
   * 将map和bloom置空，下次查询时通过ensureCacheBuilt自动重建
   */
  public async invalidate(): Promise<void> {
    this.map = null;
    this.bloom = null;
    this.built = false;
  }

  /**
   * 重建
   * 读取开关配置：未启用的对应缓存设置为 null
   * 获取所有元素
   * 根据元素数量按预期误判率(1%)重创建布隆过滤器
   * 将所有元素添加到已启用的缓存中
   */
  public async rebuild(): Promise<void> {
    // 读取缓存开关配置
    const settings = await this.resolveSettings();

    // 获取所有元素（先取数据，以便确定预期元素数）
    const allItems = await this.get_all();

    // 按开关设置构建缓存，未启用则设置为 null
    this.map = settings.map ? new Map<string, T>() : null;
    // 根据预期元素数创建布隆过滤器（默认误判率 1%）
    this.bloom = settings.bloom ? BloomFilter.create(Math.max(allItems.length, 1)) : null;

    // 将所有元素添加到缓存中
    for (const item of allItems) {
      const key = this.key_getter(item);
      if (this.bloom !== null) this.bloom.add(key);
      if (this.map !== null) this.map.set(key, item);
    }

    this.built = true;
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
   * 按 bloom -> map -> 黑名单 list 顺序逐级检查：
   * 1. bloom 不为 null 且无记录则立刻返回 false（布隆过滤器可能有误报但绝不会误漏）
   * 2. map 不为 null 则立刻返回其查询结果
   * 3. 否则回退到黑名单 list 查询结果
   */
  public async key_exist(key: string): Promise<boolean> {
    await this.ensureCacheBuilt();

    // 1. 布隆过滤器说一定不存在
    if (this.bloom !== null && !this.bloom.mightContain(key)) {
      return false;
    }

    // 2. HashMap 缓存存在，直接返回其查询结果
    if (this.map !== null) {
      return this.map.has(key);
    }

    // 3. 回退到黑名单 list 查询
    const allItems = await this.get_all();
    return allItems.some((item) => this.key_getter(item) === key);
  }

  /**
   * 根据指定的key获取对应的元素
   * 按 bloom -> map -> 黑名单 list 顺序逐级检查：
   * 1. bloom 不为 null 且无记录则立刻返回 undefined（布隆过滤器可能有误报但绝不会误漏）
   * 2. map 不为 null 则立刻返回其查询结果
   * 3. 否则回退到黑名单 list 查询结果
   * @param key 要查找的key
   * @returns 对应的元素，如果不存在则返回undefined
   */
  public async get(key: string): Promise<T | undefined> {
    await this.ensureCacheBuilt();

    // 1. 布隆过滤器说一定不存在
    if (this.bloom !== null && !this.bloom.mightContain(key)) {
      return undefined;
    }

    // 2. HashMap 缓存存在，直接返回其查询结果
    if (this.map !== null) {
      return this.map.get(key);
    }

    // 3. 回退到黑名单 list 查询
    const allItems = await this.get_all();
    return allItems.find((item) => this.key_getter(item) === key);
  }
}