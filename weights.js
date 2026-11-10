/*
 * 常見物品參考重量表
 * ------------------------------------------------------------
 * 想增加項目，照下面的格式複製一行，改內容就好：
 *
 *   { name: '名稱', weight: 重量(公斤), category: '品類', unit: '個或包', aliases: ['別名', ...], note: '補充說明' },
 *
 * - weight：大約重量，單位是「公斤」。例如 50 公克請寫 0.05。
 * - category：必須是七大品類之一：
 *     必備品、保健品、保養品、特殊類、禮物、食品、電線電器
 * - unit：'個' 或 '包'。可以省略，省略時當作 '個'。
 * - aliases：其他叫法，輸入這些字也能對到。可以省略。
 *   簡體字大多會自動轉換，不用另外寫。
 * - note：補充說明，例如「一雙」「一盒」，會顯示在重量下方。可以省略。
 * - 每一行最後記得加逗號。
 */
window.REFERENCE_WEIGHTS = [
  // ① 必備品：證件、錢、衣服、鞋子配件
  { name: '護照', weight: 0.04, category: '必備品', aliases: ['passport', '護照套', '護照夾'] },
  { name: '錢包', weight: 0.15, category: '必備品', aliases: ['皮夾', '長夾', '短夾', '零錢包'] },
  { name: '信用卡', weight: 0.005, category: '必備品', aliases: ['金融卡', '提款卡', '卡片', '悠遊卡'] },
  { name: '現金', weight: 0.02, category: '必備品', aliases: ['鈔票', '外幣', '台幣'] },
  { name: '簽證文件', weight: 0.02, category: '必備品', aliases: ['簽證', '機票', '行程表', '文件', '證件'] },
  { name: '證件夾', weight: 0.12, category: '必備品', aliases: ['證件包', '旅行收納包'] },
  { name: 'T恤', weight: 0.15, category: '必備品', aliases: ['短袖', '短T', 'tshirt', '上衣'] },
  { name: '長袖上衣', weight: 0.25, category: '必備品', aliases: ['長袖', '長T'] },
  { name: '襯衫', weight: 0.2, category: '必備品', aliases: ['白襯衫', '襯衣'] },
  { name: '背心', weight: 0.1, category: '必備品', aliases: ['無袖', '坦克背心', '細肩帶'] },
  { name: '針織衫', weight: 0.3, category: '必備品', aliases: ['針織外套', '開襟衫'] },
  { name: '毛衣', weight: 0.45, category: '必備品', aliases: ['針織上衣'] },
  { name: '外套', weight: 0.6, category: '必備品', aliases: ['夾克', '風衣', '西裝外套'] },
  { name: '羽絨外套', weight: 0.5, category: '必備品', aliases: ['羽絨衣', '羽絨服', '輕羽絨'] },
  { name: '大衣', weight: 1.3, category: '必備品', aliases: ['長大衣', '毛呢大衣'] },
  { name: '牛仔褲', weight: 0.6, category: '必備品', aliases: ['jeans'] },
  { name: '長褲', weight: 0.4, category: '必備品', aliases: ['褲子', '西裝褲', '休閒褲'] },
  { name: '短褲', weight: 0.2, category: '必備品' },
  { name: '裙子', weight: 0.25, category: '必備品', aliases: ['短裙', '長裙', '半身裙'] },
  { name: '洋裝', weight: 0.35, category: '必備品', aliases: ['連身裙', '連衣裙'] },
  { name: '內衣', weight: 0.06, category: '必備品', aliases: ['胸罩', '運動內衣'] },
  { name: '內褲', weight: 0.04, category: '必備品' },
  { name: '襪子', weight: 0.05, category: '必備品', aliases: ['襪'], note: '一雙' },
  { name: '睡衣', weight: 0.35, category: '必備品', aliases: ['居家服'] },
  { name: '泳衣', weight: 0.15, category: '必備品', aliases: ['泳裝', '比基尼', '泳褲'] },
  { name: '運動鞋', weight: 0.8, category: '必備品', aliases: ['球鞋', '布鞋', '跑鞋', '慢跑鞋', '鞋子', '跑步鞋', '走路鞋', '網球鞋', '休閒運動鞋'], note: '一雙' },
  { name: '平底鞋', weight: 0.5, category: '必備品', aliases: ['芭蕾舞鞋', '娃娃鞋'], note: '一雙' },
  { name: '皮鞋', weight: 0.9, category: '必備品', aliases: ['樂福鞋'], note: '一雙' },
  { name: '高跟鞋', weight: 0.6, category: '必備品', aliases: ['跟鞋', '楔型鞋', '細跟', '粗跟'], note: '一雙' },
  { name: '靴子', weight: 1.2, category: '必備品', aliases: ['短靴', '長靴', '雪靴', '雨靴'], note: '一雙' },
  { name: '拖鞋', weight: 0.3, category: '必備品', aliases: ['涼鞋', '夾腳拖', '室內拖'], note: '一雙' },
  { name: '帽子', weight: 0.1, category: '必備品', aliases: ['棒球帽', '漁夫帽', '毛帽', '登山帽', '草帽', '貝雷帽', '紳士帽'] },
  { name: '圍巾', weight: 0.15, category: '必備品', aliases: ['披肩', '絲巾'] },
  { name: '皮帶', weight: 0.15, category: '必備品', aliases: ['腰帶'] },
  { name: '包包', weight: 0.5, category: '必備品', aliases: ['包', '手提包', '肩背包', '後背包', '斜背包'] },
  { name: '耳環', weight: 0.01, category: '必備品', aliases: ['耳飾', '耳夾'] },
  { name: '項鍊', weight: 0.02, category: '必備品', aliases: ['項鏈', '鍊子'] },
  { name: '戒指', weight: 0.01, category: '必備品' },
  { name: '手環', weight: 0.03, category: '必備品', aliases: ['手鍊', '手鐲'] },
  { name: '手錶', weight: 0.1, category: '必備品', aliases: ['錶', '智慧手錶', 'applewatch'] },
  { name: '錶帶', weight: 0.03, category: '必備品', aliases: ['錶鍊', '手錶帶'] },
  { name: '太陽眼鏡', weight: 0.04, category: '必備品', aliases: ['墨鏡', '眼鏡'] },
  { name: '雨傘', weight: 0.3, category: '必備品', aliases: ['摺疊傘', '折疊傘', '傘', '陽傘'] },
  { name: '保溫瓶', weight: 0.35, category: '必備品', aliases: ['保溫杯', '水壺', '水瓶', '隨行杯'] },

  // ② 保健品：保健食品與藥品
  { name: '維他命', weight: 0.15, category: '保健品', aliases: ['維生素', '綜合維他命', '保健食品'], note: '一罐' },
  { name: '魚油', weight: 0.2, category: '保健品', note: '一罐' },
  { name: '益生菌', weight: 0.1, category: '保健品', note: '一盒' },
  { name: '常備藥', weight: 0.1, category: '保健品', unit: '包', aliases: ['藥品', '藥', '感冒藥', '止痛藥', '腸胃藥', '藥包'] },
  { name: '口罩', weight: 0.1, category: '保健品', unit: '包', note: '約 20 片' },
  { name: '隱形眼鏡', weight: 0.05, category: '保健品', aliases: ['隱眼', '日拋'], note: '一盒' },
  { name: '眼藥水', weight: 0.02, category: '保健品' },

  // ③ 保養品：臉部、身體、手部
  { name: '牙刷', weight: 0.02, category: '保養品', aliases: ['電動牙刷'] },
  { name: '牙膏', weight: 0.1, category: '保養品' },
  { name: '洗面乳', weight: 0.15, category: '保養品', aliases: ['洗面奶', '潔面乳', '洗臉'] },
  { name: '化妝水', weight: 0.2, category: '保養品', aliases: ['爽膚水', '精華液', '精華'] },
  { name: '乳液', weight: 0.15, category: '保養品', aliases: ['乳霜', '面霜', '保濕霜'] },
  { name: '防曬乳', weight: 0.1, category: '保養品', aliases: ['防曬', '防曬霜'] },
  { name: '面膜', weight: 0.25, category: '保養品', note: '一盒' },
  { name: '身體乳', weight: 0.3, category: '保養品', aliases: ['身體乳液', '潤膚乳'] },
  { name: '護手霜', weight: 0.05, category: '保養品', aliases: ['護手乳'] },
  { name: '洗髮精', weight: 0.4, category: '保養品', aliases: ['洗髮乳', '洗髮水', '潤髮乳', '護髮'] },
  { name: '沐浴乳', weight: 0.4, category: '保養品', aliases: ['沐浴露', '沐浴精'] },
  { name: '旅行分裝瓶', weight: 0.15, category: '保養品', unit: '包', aliases: ['分裝瓶', '旅行組', '盥洗包'] },
  { name: '化妝包', weight: 0.6, category: '保養品', aliases: ['化妝品', '彩妝'] },
  { name: '刮鬍刀', weight: 0.05, category: '保養品', aliases: ['剃刀'] },
  { name: '梳子', weight: 0.05, category: '保養品', aliases: ['髮梳'] },
  { name: '毛巾', weight: 0.2, category: '保養品', aliases: ['浴巾', '洗臉巾'] },

  // ④ 特殊類：騎馬、網球等活動用品
  { name: '馬靴', weight: 1.5, category: '特殊類', aliases: ['騎馬靴', '馬術靴'], note: '一雙' },
  { name: '馬術頭盔', weight: 0.5, category: '特殊類', aliases: ['騎馬頭盔', '頭盔', '安全帽'] },
  { name: '馬褲', weight: 0.4, category: '特殊類', aliases: ['騎馬褲', '馬術褲'] },
  { name: '馬術手套', weight: 0.08, category: '特殊類', aliases: ['騎馬手套'] },
  { name: '網球拍', weight: 0.3, category: '特殊類', aliases: ['球拍', '羽球拍'] },
  { name: '網球', weight: 0.2, category: '特殊類', unit: '包', note: '一筒 3 顆' },
  { name: '運動服', weight: 0.2, category: '特殊類', aliases: ['運動衣', '運動褲', '瑜伽服'] },
  { name: '泳鏡', weight: 0.05, category: '特殊類', aliases: ['蛙鏡', '泳帽'] },
  { name: '瑜伽墊', weight: 1.0, category: '特殊類', aliases: ['運動墊'] },
  { name: '登山杖', weight: 0.3, category: '特殊類', aliases: ['健行杖'] },

  // ⑤ 禮物
  { name: '鳳梨酥', weight: 0.5, category: '禮物', aliases: ['糕點', '伴手禮'], note: '一盒' },
  { name: '茶葉', weight: 0.2, category: '禮物', unit: '包', aliases: ['茶', '烏龍茶', '高山茶'] },
  { name: '巧克力', weight: 0.3, category: '禮物', note: '一盒' },
  { name: '香水', weight: 0.3, category: '禮物', note: '含盒子' },
  { name: '紅酒', weight: 1.4, category: '禮物', aliases: ['葡萄酒', '酒', '白酒'], note: '一瓶' },
  { name: '小禮物', weight: 0.2, category: '禮物', aliases: ['禮物', '紀念品'] },

  // ⑥ 食品
  { name: '泡麵', weight: 0.1, category: '食品', aliases: ['泡面', '杯麵', '速食麵', '方便麵'] },
  { name: '零食', weight: 0.2, category: '食品', unit: '包', aliases: ['餅乾', '洋芋片'] },
  { name: '咖啡豆', weight: 0.25, category: '食品', unit: '包', aliases: ['咖啡粉'] },
  { name: '即溶咖啡', weight: 0.2, category: '食品', unit: '包', aliases: ['咖啡', '三合一', '濾掛咖啡'] },
  { name: '堅果', weight: 0.2, category: '食品', unit: '包', aliases: ['綜合堅果'] },
  { name: '果乾', weight: 0.2, category: '食品', unit: '包', aliases: ['水果乾'] },

  // ⑦ 電線電器
  { name: '充電線', weight: 0.05, category: '電線電器', aliases: ['傳輸線', '數據線', 'USB線', '線', 'lightning', 'typec', 'type-c'] },
  { name: '充電器', weight: 0.1, category: '電線電器', aliases: ['充電頭', '豆腐頭', '變壓器', '電源供應器'] },
  { name: '行動電源', weight: 0.25, category: '電線電器', aliases: ['行充', '充電寶', '移動電源', '尿袋'] },
  { name: '轉接頭', weight: 0.1, category: '電線電器', aliases: ['萬國轉接頭', '轉換插頭', '插頭轉換', '旅行插頭', '轉換頭'] },
  { name: '延長線', weight: 0.3, category: '電線電器', aliases: ['排插', '插座'] },
  { name: 'iPad', weight: 0.48, category: '電線電器', aliases: ['平板', '平板電腦', 'ipadpro', 'ipadair'] },
  { name: 'iPad 鍵盤', weight: 0.6, category: '電線電器', aliases: ['巧控鍵盤', 'magickeyboard', '鍵盤保護套'] },
  { name: '鍵盤', weight: 0.4, category: '電線電器', aliases: ['藍牙鍵盤', '無線鍵盤'] },
  { name: '筆電', weight: 1.4, category: '電線電器', aliases: ['筆記型電腦', '筆記本電腦', '電腦', 'macbook', 'laptop'] },
  { name: '手機', weight: 0.2, category: '電線電器', aliases: ['iphone', '備用機'] },
  { name: '耳機', weight: 0.05, category: '電線電器', aliases: ['藍牙耳機', 'airpods', '無線耳機'] },
  { name: '耳罩式耳機', weight: 0.25, category: '電線電器', aliases: ['頭戴耳機', '頭戴式耳機', '降噪耳機'] },
  { name: '吹風機', weight: 0.5, category: '電線電器', aliases: ['風筒'] },
  { name: '電捲棒', weight: 0.3, category: '電線電器', aliases: ['離子夾', '直髮夾', '捲髮棒', '電棒'] },
  { name: '電動刮鬍刀', weight: 0.15, category: '電線電器', aliases: ['電鬍刀'] },
  { name: '相機', weight: 0.6, category: '電線電器', aliases: ['單眼', '微單', '數位相機', '拍立得'] },
  { name: '滑鼠', weight: 0.08, category: '電線電器', aliases: ['藍牙滑鼠'] },
  { name: 'Apple Pencil', weight: 0.02, category: '電線電器', aliases: ['觸控筆', 'pencil', '手寫筆'] },
  { name: '電子書閱讀器', weight: 0.2, category: '電線電器', aliases: ['kindle', 'kobo', '電子書'] }
];
