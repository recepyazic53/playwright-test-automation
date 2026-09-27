// YASAK SÖZCÜK DENETİMİ — kodda bulunmaması gereken şirket / ürün / servis adları ve alana (sektöre) özgü terimler.
//
// Sözcükler bu dosyada DÜZ METİN OLARAK TUTULMAZ: her biri normalleştirilip (küçük harf, Türkçe karakter
// sadeleştirilmiş: ç→c ğ→g ı→i ö→o ş→s ü→u) SHA-256 özeti olarak durur. Denetim, metindeki sözcükleri aynı
// biçimde normalleştirip özetler ve karşılaştırır.
//  - onek: sözcük (ya da camelCase / tire / alt çizgi ile ayrılmış bir tanımlayıcının herhangi bir parçadan
//    başlayan kalanı) bu önekle başlıyorsa yasak (ör. önek "abc" → "Abc", "abcDef", "xAbcDef", "x-abc-def").
//  - tam: bir tanımlayıcının ardışık parçalarının birleşimi tam olarak bu sözcükse yasak.
// Yeni sözcük eklemek: yasakOzeti('sözcük') çıktısını ilgili listeye [tur, normalleştirilmiş uzunluk, özet] olarak
// ekleyin (sözcüğün kendisini hiçbir dosyaya yazmayın).
import { createHash } from 'node:crypto';

type YasakTuru = 'onek' | 'tam';
/** [tür, normalleştirilmiş sözcük uzunluğu, SHA-256 özeti (hex)] */
export type YasakGirdisi = readonly [YasakTuru, number, string];

/** Kod deposunda (scripts/**, docs/**, tests/**, kök *.md) hiç geçmemesi gereken sözcükler. */
export const YASAK_OZETLERI: readonly YasakGirdisi[] = [
  ['onek', 7, 'ab86888971fdd53abd560892d281a458fe594ab8b632a7ef75174c0c4ed195f3'],
  ['onek', 6, '209cf6b30b406bd8706b507b9b918084e999ab563f11123f1336507e0546bdf8'],
  ['onek', 6, 'a257209d0d7ac4fdfb4e30386774e4011fb3c946fe452520307c39621aded403'],
  ['onek', 6, '1366fac71146793a85e98a88ad9bb15adb9aac31da8ac6d73e67059bd5a467a9'],
  ['onek', 6, '4bd98d8e21ba4d0c5ac621fe7269f57d21d2d904874842d78bf1569f18766460'],
  ['onek', 7, 'bc273dc80396980bc26f25c58896b9bd46562fbc3e5f92bc73ff8f4831e03f7d'],
  ['onek', 6, 'b4cc4a0d68dcad398cc6443f62f1a41cabd9f1b3365b0b0042cf7827a93761d5'],
  ['onek', 5, '2d73f9271f4b8dc562403821c7a9291baaa3aa73319ec39865ed7630befe9e86'],
  ['onek', 7, '6b74f64f110deb2b5467b452df3968ae591a5c5421d8409703b1fb13dc305a8c'],
  ['onek', 7, '3711561cf43cc5f1d83ba2e9f21e5eed1535a25c1e7359c1ab0d7fa6deb48530'],
  ['onek', 5, '5a376993386af8e4af5cdc54bd764da8897bf366f4dc133c82811cb68b4a6a2b'],
  ['onek', 4, 'f96bbf7e28b65842609c60a3a2770553d0dbd08a836180ed0daa3f4404cb7da3'],
  ['onek', 4, '946de113ebe94dd1853c149c7f7f1c24946f0c198064d8a1694220cea1dc63c2'],
  ['onek', 4, '4b29228fc720429159f62f43a6375b783b4c96b7aa7ee409461e9b2ae15aba87'],
  ['onek', 4, '278b726d6dd27438809f039e52b2108f9eec2f7be13008884660ffd29ed16ec1'],
  ['onek', 13, 'a80e28ad0091640c3201b7a39e47b63c96e9429edc29829ee531356728078caf'],
  ['onek', 18, 'd0b2ce823d5845ae696c9a29ed9fad65c2544babd18003e0704bda12550c56ad'],
  ['onek', 12, '569bbc1647c3ba13466e10c0b2f690d8ae1ccad9f8495386a445834e54c7c54f'],
  ['onek', 9, '17aee107a6420d76cd315d3d4116287c046e110d10431703ee1801ba7e1e6e60'],
  ['onek', 10, '24796dd7c167e8984d8934dc75a4d0d02a0c29d38707af0c57e21115110b329c'],
  ['onek', 14, '03eb45c8749bf40f4a788a09049ca36ec6a7bef9c09b039899521ab63ebef146'],
  ['onek', 13, '47941f1d71dd04b48437222961747d061b82b64f3c630b9d46e819fa552be0bd'],
  ['onek', 8, 'f00799c8db2a592353b9257d97fe35232f514f261884d2764917f1e07d2eed59'],
  ['onek', 26, '28f13ab5a4d95bb83656e1d1df907e735e6a5f577d4d5a9d65109680d1e2c8ed'],
  ['onek', 7, 'f2ecaed8f976de285371b389906c823dee461bb2d19e549b7a496bc09bb088f7'],
  ['onek', 6, '57bc68552b9d6c1d39734735dcf470805957f0c9d88094ee79831406139b5172'],
  ['onek', 6, '6409249e3861672945655862bfe926c24e826ff82c06f84473110df09e20af3b'],
  ['onek', 15, '18db137d395f669b474ff1ced2366d67ccae066c6c5f4e380ee7384712c610ab'],
  ['onek', 8, '7a4e541c07ef077a03d682d2ff6ec7f14dd14fadc8f0704afaa0299a64490679'],
  ['onek', 15, '804e4dc8e742ebf7262b5ac9380fa1ce9f90a6a1818a85e8369ddef6e68ea595'],
  ['onek', 17, '1a5c6d8cf20632e70dd31e94235b0a757f76b8c2c469dc8321a0ef1bcd577793'],
  ['onek', 20, 'a3e994576cac8f8d0e028553e6417d5ccb0f5e2a4f4aed5e9dd0f5eaa759228a'],
  ['onek', 14, '2abaacc8bf3ff3f99bc95439fe492308bb644f497f7abe081fd63e9cfae0773c'],
  ['onek', 16, 'f831f98715ab2b2341d772962388125d6e14b6c0943b17db9d4f78347d277d03'],
  ['onek', 8, '61a0a6759a9c6b7874618aa4268d2ba91b6ad2c5dbe2db92c57400a2ea96f07b'],
  ['onek', 4, 'bb384ab2177d9a30591c5bfa980acd024549ba783109c6ddc9ca0c0bc65671af'],
  ['onek', 12, 'b6aa90ecdc8958c9f0531548427b13d320192cd047a65710e6193b3b5749451a'],
  ['tam', 4, 'cf8cabd51c9a1a238b0b7b44b4400e7ebda2fce0854d8c3d020f9e3cf9b37208'],
  ['tam', 6, '3dc9d630bfb027ce96181c21c7fea38d6a3092a86ee8926414e376343217faad'],
  ['tam', 8, 'ecd1378bc9dc130008f00d58db5d26f60db55934a49b949af7e6f6a8da2a2beb'],
  ['tam', 9, '4d225aa8dfea9a46d3ec6d11980f4dc5ad867d69d1d11b5da70f0b1afd0ce394'],
  ['tam', 13, '4c635ea607af776d0ea9f2caa7553c51b2667cd8f78ca023631199e4ce1813ff'],
  ['tam', 8, 'fc2ac4752ca94f4a229e1fc909bba6ba6a232e4629b466dd2b5d10ffbf58bfbc'],
  ['tam', 11, '0f540d3e12e3abb7c31d962b16b5a9574c647292e642d2adf63f17bd020bdf34'],
  ['tam', 10, '7360d47c8f2270d2b50d0d2c04ef48063e28cb07071b7f1fdb4540e9a604078d'],
  ['tam', 8, 'a4a2f985ed8d011352092f55aef61adcad247039dac19cd836024dbc4fd01143'],
  ['tam', 7, 'e53e1beea262245290fe580c4211956f4df98040ded846c1fc89bbe19a5f0596'],
  ['tam', 9, 'd7de174364f246c4f6108ec289deb22d74292d5993500e683d1f3dbe246620e8'],
  ['tam', 9, '6d1cfc786c4a361d8b647355ba9b2f8c62c727b3e586e8bb01cd3beffa9e2d02'],
  ['tam', 17, '06dcf4dae521ee83c58434473b90cfbc150ea594ea46bf47793eee73498d1bc9'],
  ['tam', 15, '43bb559573039af937f1aec6da6b95ec237c92cf688bfebf630fe7eedc06cc5f'],
  ['tam', 20, 'b45f8d935283e730f05917c1247618934d0c097f8a5976988a777c7c0e591eac'],
  ['tam', 17, 'e59065a4943304736f81f4829ca02b963ad6ede73c62b194d2071acb89965baf'],
  ['tam', 10, 'f4ee95d419662b7055aba1227a1da43d46778b210f1640df3520ad6b0f1ad22e'],
  ['tam', 13, '5506996d12c5346a30e28789d40675a83f416f1b6cfbfa5d9fc5660d9a3e0573'],
  ['tam', 4, 'bc18e59fa9f9757900540a82abdb0b79f03dbca79821218d2ec4bb16f5138a87'],
  ['tam', 8, '5c579fc7a48f6ef3675f5c2f4944737c4ffa8c9d0d703bf5b7784afafb2088e0'],
  ['tam', 8, '5dbe1b28a8d5cb3a5161f655f1af03b8b43ec34688c1a9a1fcf1934681313f3a']
];

/** Platform motorunda (şema, depo, sunucu) geçmemesi gereken, projeye özgü kavramlar. */
export const MOTOR_YASAK_OZETLERI: readonly YasakGirdisi[] = [
  ['onek', 7, 'ab86888971fdd53abd560892d281a458fe594ab8b632a7ef75174c0c4ed195f3'],
  ['onek', 4, '4b29228fc720429159f62f43a6375b783b4c96b7aa7ee409461e9b2ae15aba87'],
  ['onek', 5, '23988419a638e90e45c430409a1286fbbc34b2240b8dec45d55affd8647824f9'],
  ['onek', 6, '1366fac71146793a85e98a88ad9bb15adb9aac31da8ac6d73e67059bd5a467a9']
];

/** Denetimden BİLEREK muaf dosyalar (depo köküne göre, / ayraçlı). */
export const DENETIM_MUAFLARI: readonly string[] = [
  // Bu dosya (yalnızca özet içerir; yine de kendini denetlemez).
  'tests/birim/yasak-sozcukler.ts',
  // Geriye uyum tablosu: kasadaki eski kayıtların anahtar adları (veri göç edildikten sonra kaldırılabilir).
  'scripts/dogrulama/eski-anahtarlar.mjs'
];

/** Küçük harf + Türkçe karakter sadeleştirme (ç→c ğ→g ı→i ö→o ş→s ü→u; diğer aksanlar atılır). */
export function normallestir(metin: string): string {
  return metin.toLocaleLowerCase('tr').replace(/ı/g, 'i').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Bir sözcüğün listeye eklenecek özeti (normalleştirilmiş biçimin SHA-256'sı). */
export function yasakOzeti(sozcuk: string): string {
  return createHash('sha256').update(normallestir(sozcuk), 'utf8').digest('hex');
}

const PARCA = /\p{Lu}+(?=\p{Lu}\p{Ll})|\p{Lu}?\p{Ll}+|\p{Lu}+|\p{N}+/gu;
/** Tanımlayıcı ya da sözcük: harf/rakam, tire ve alt çizgi (80 karakteri aşan diziler — ör. base64 — atlanır). */
const DIZI = /[\p{L}\p{N}_-]+/gu;

/** Tanımlayıcıyı parçalarına ayırır: tire / alt çizgi, camelCase ve rakam sınırları. */
function parcalar(dizi: string): string[] {
  return dizi.split(/[_-]+/).flatMap((p) => p.match(PARCA) ?? []).map(normallestir).filter(Boolean);
}

export interface YasakBulgusu {
  /** Metinde bulunan dizi (tanımlayıcı ya da sözcük). */
  dizi: string;
  /** 1'den başlayan satır numarası. */
  satir: number;
}

/** Metinde listedeki (varsayılan: YASAK_OZETLERI) bir sözcüğü içeren dizileri döner (yoksa boş dizi). */
export function yasakSozcukleriBul(metin: string, liste: readonly YasakGirdisi[] = YASAK_OZETLERI): YasakBulgusu[] {
  const onekler = new Map<number, Set<string>>();
  const tamlar = new Set<string>();
  for (const [tur, uzunluk, ozet] of liste) {
    if (tur === 'tam') tamlar.add(ozet);
    else {
      if (!onekler.has(uzunluk)) onekler.set(uzunluk, new Set());
      onekler.get(uzunluk)?.add(ozet);
    }
  }
  const enUzunTam = Math.max(0, ...liste.filter((g) => g[0] === 'tam').map((g) => g[1]));
  const onbellek = new Map<string, string>();
  const ozetle = (s: string): string => {
    let o = onbellek.get(s);
    if (o === undefined) { o = createHash('sha256').update(s, 'utf8').digest('hex'); onbellek.set(s, o); }
    return o;
  };
  const diziYasakMi = (dizi: string): boolean => {
    const p = parcalar(dizi);
    for (let i = 0; i < p.length; i += 1) {
      const kalan = p.slice(i).join('');
      for (const [uzunluk, kume] of onekler) if (kalan.length >= uzunluk && kume.has(ozetle(kalan.slice(0, uzunluk)))) return true;
      let birlesik = '';
      for (let j = i; j < p.length; j += 1) {
        birlesik += p[j];
        if (birlesik.length > enUzunTam) break;
        if (tamlar.has(ozetle(birlesik))) return true;
      }
    }
    return false;
  };
  const bulgular: YasakBulgusu[] = [];
  const denenen = new Map<string, boolean>();
  const satirBaslari = [0];
  for (let i = 0; i < metin.length; i += 1) if (metin.charCodeAt(i) === 10) satirBaslari.push(i + 1);
  const satirBul = (konum: number): number => {
    let alt = 0; let ust = satirBaslari.length - 1;
    while (alt < ust) { const orta = (alt + ust + 1) >> 1; if (satirBaslari[orta] <= konum) alt = orta; else ust = orta - 1; }
    return alt + 1;
  };
  for (const m of metin.matchAll(DIZI)) {
    const dizi = m[0];
    if (dizi.length > 80) continue;
    let yasak = denenen.get(dizi);
    if (yasak === undefined) { yasak = diziYasakMi(dizi); denenen.set(dizi, yasak); }
    if (yasak) bulgular.push({ dizi, satir: satirBul(m.index ?? 0) });
  }
  return bulgular;
}

/** SQL tablo tanımlarında (create table … ;) yasak sözcük geçen dizileri döner. */
export function tabloTanimindaYasakBul(metin: string, liste: readonly YasakGirdisi[] = YASAK_OZETLERI): YasakBulgusu[] {
  return [...metin.matchAll(/create table[^;]*/gi)].flatMap((m) => yasakSozcukleriBul(m[0], liste));
}
