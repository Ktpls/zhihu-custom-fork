import json

from utilitypack.util_solid import *

inputs = [
    r"C:\Users\KITA\Downloads\黑名单配置2.txt",
    r"C:\Users\KITA\Downloads\黑名单配置-20250602-093725-1748828245828.csv",
    r"C:\Users\KITA\Downloads\黑名单配置-20250602-105015-1748832615749.txt",
    r"C:\Users\KITA\Downloads\黑名单配置-20250602-105437-1748832877534.txt",
    r"C:\Users\KITA\Downloads\黑名单配置-20250605-170926-1749114566301.txt",
    r"C:\Users\KITA\Downloads\黑名单配置-20250619-165811-1750323491956.txt",
    r"C:\Users\KITA\Downloads\黑名单配置-20250629-175511-1751190911498.csv.txt",
    r"C:\Users\KITA\Downloads\黑名单配置-20250629-180524-1751191524089.txt",
    r"C:\Users\KITA\Downloads\黑名单配置-20250629-184250-1751193770426.txt",
]
outputs = r"C:\Users\KITA\Downloads\黑名单配置202506291843.txt"
configs = Stream(inputs).map(ReadTextFile).map(json.loads).to_list()
blockeds = (
    Stream(configs)
    .flat_map(lambda x: x["blockedUsers"])
    .distinct(lambda x: x["urlToken"])
    .collect(list)
)

print(f"{len(blockeds)=}")
# out = configs[0]
# out.update({"blockedUsers": blockeds})
# WriteTextFile(outputs, json.dumps(out, ensure_ascii=False))
