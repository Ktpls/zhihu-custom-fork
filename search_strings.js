const fs = require('fs');
const content = fs.readFileSync('C:/file/code/zhihu-custom-fork/index.js', 'utf8');
const idx = content.indexOf('INNER_HTML');
if (idx >= 0) {
  const substr = content.substring(idx, idx + 150000);
  
  // Search for various terms
  const searchTerms = ['布隆', 'HashMap', 'hashmap', '黑名单缓存', '黑名单过滤', '启用.*缓存', '启用.*过滤'];
  searchTerms.forEach(term => {
    try {
      const regex = new RegExp(term);
      const match = substr.match(regex);
      if (match) {
        const pos = substr.indexOf(match[0]);
        const context = substr.substring(Math.max(0, pos - 300), pos + 300);
        console.log('Found:', term);
        console.log('Context:', context);
        console.log('---');
      } else {
        console.log('Not found:', term);
      }
    } catch (e) {
      console.log('Error searching for:', term, e.message);
    }
  });
}