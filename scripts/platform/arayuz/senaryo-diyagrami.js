// Senaryo AKIŞ DİYAGRAMI (salt okunur; aşama 3a) — senaryo sayfasının "Akış diyagramı" sekmesi.
// Akış, ekran modelinden ve formdaki GÜNCEL seçimlerden (adım kapsamı, koşullu alanlar, beklenen sonuç) çıkarılır
// (saf hesap: akis-diyagrami.mjs); renkler senaryonun seçili ortamdaki SON koşusundan gelir
// (GET /platform/senaryo/son-sonuc). Dikey düzen: başlangıç → adımlar (alanlar, ilerleme düğmesi) → bitiş.
// Ekran sayfasının "Akış" sekmesi de aynı çizimi kullanır (bilgi.durum 'ekran': senaryo seçimi ve koşu rengi yok).
// Dış kütüphane yok; kullanıcı verisi DOM'a yalnızca metin olarak yazılır (h(); innerHTML yok).
import { api, h, ikon, rozet, tarihMetni, yerlestir } from './ortak.js';
import { girisAdimlariOzeti, tarifFormuAdresi } from './giris-ozeti.mjs';

const DURUMLAR = {
  basarili: { etiket: 'Geçti', sinif: 'basari', ikonAd: 'onay' },
  basarisiz: { etiket: 'Kaldı', sinif: 'hata', ikonAd: 'carpi' },
  durduruldu: { etiket: 'Durduruldu', sinif: 'durdu', ikonAd: 'eksi' },
  atlanan: { etiket: 'Atlandı', sinif: 'atlanan', ikonAd: 'eksi' },
  kosulmadi: { etiket: 'Koşulmadı', sinif: 'notr', ikonAd: 'eksi' }
};
const SONUC_DURUMLARI = { basarili: 'Başarılı', basarisiz: 'Başarısız', atlanan: 'Atlandı', durduruldu: 'Durduruldu' };
const GORUNUR_ALAN_SINIRI = 10;

const saniye = (ms) => `${(ms / 1000).toFixed(1).replace('.', ',')} sn`;
const ilkSatir = (m) => String(m || '').split('\n').map((x) => x.trim()).find(Boolean) || '';

function durumCipi(sonuc) {
  if (!sonuc) return null;
  const d = DURUMLAR[sonuc.durum] || DURUMLAR.kosulmadi;
  return h('span', { class: `diyagram-durum ${d.sinif}` }, ikon(d.ikonAd), d.etiket,
    sonuc.sureMs != null ? h('span', { class: 'sure' }, saniye(sonuc.sureMs)) : null);
}

function hataSatiri(sonuc) {
  return sonuc && sonuc.hataMesaji && sonuc.durum === 'basarisiz'
    ? h('p', { class: 'diyagram-hata', title: sonuc.hataMesaji }, ikon('uyari'), ilkSatir(sonuc.hataMesaji)) : null;
}

function alanOgesi(a) {
  const gizli = a.buSenaryoda === false;
  const bilinmiyor = a.buSenaryoda === null;
  return h('li', {
    class: ['diyagram-alani', a.kosul ? 'kosullu' : '', gizli ? 'gizli' : ''].join(' ').trim(),
    title: gizli ? 'Bu senaryoda görünmez (koşul sağlanmıyor); doldurulmaz.' : bilinmiyor ? 'Bu senaryoda görünüp görünmeyeceği bilinmiyor.' : null
  },
  h('span', { class: 'ad' }, a.etiket, a.zorunlu ? h('span', { class: 'zorunlu-etiketi', title: 'Akışta zorunlu: ekranda görünmezse test başarısız olur' }, 'zorunlu') : null),
  a.kosul ? h('span', { class: 'kosul', title: 'Alan yalnızca bu koşulda görünür' }, ikon('isaret'), gizli ? `${a.kosul} (bu senaryoda değil)` : a.kosul) : null);
}

function alanListesi(alanlar) {
  if (!alanlar.length) return null;
  const ilk = alanlar.slice(0, GORUNUR_ALAN_SINIRI);
  const kalan = alanlar.slice(GORUNUR_ALAN_SINIRI);
  return h('div', { class: 'diyagram-alanlari' },
    h('ul', {}, ilk.map(alanOgesi)),
    kalan.length ? h('details', {}, h('summary', {}, `+${kalan.length} alan daha`), h('ul', {}, kalan.map(alanOgesi))) : null);
}

function dugumSinifi(sonuc, ek = '') {
  const d = sonuc ? DURUMLAR[sonuc.durum] || DURUMLAR.kosulmadi : null;
  return ['diyagram-dugumu', ek, d ? `durum-${d.sinif}` : ''].join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Akışın başındaki giriş bloğunun ayrıntısı: açılınca ortamın giriş tarifi okunur adımlarla gösterilir (tarif ayrıca yüklenir;
 * gizli değer yok) ve tarif formuna bağlantı verilir (#/ayarlar/giris/tarif/<ortamId>).
 */
export function girisAyrintisi(bilgi) {
  const govde = h('div', { class: 'giris-diyagram-ayrinti' }, h('p', { class: 'soluk kucuk' }, 'Yükleniyor…'));
  const adres = bilgi.ortamId ? tarifFormuAdresi(bilgi.ortamId) : '#/ayarlar/giris';
  let yuklendi = false;
  const kutu = h('details', { class: 'giris-diyagram' }, h('summary', {}, 'Giriş adımları'), govde,
    h('a', { class: 'dugme hayalet kucuk-dugme', href: adres }, ikon('duzenle'), 'Giriş tarifini düzenle'));
  kutu.addEventListener('toggle', async () => {
    if (!kutu.open || yuklendi) return;
    yuklendi = true;
    if (!bilgi.projeId) { govde.replaceChildren(h('p', { class: 'soluk kucuk' }, 'Giriş ortam başına tanımlanır (Ayarlar > Giriş profilleri > Giriş tarifi).')); return; }
    try {
      const v = await api(`/platform/giris-tarifleri?projeId=${encodeURIComponent(bilgi.projeId)}`);
      const o = (v.ortamlar || []).find((x) => x.ortamId === bilgi.ortamId) || (v.ortamlar || []).find((x) => x.varsayilan) || null;
      const liste = o && o.tarif ? girisAdimlariOzeti(o.tarif) : [];
      govde.replaceChildren(liste.length
        ? h('ol', { class: 'giris-ozet-adimlari kucuk' }, liste.map((x) => h('li', {}, x.metin)))
        : h('p', { class: 'kucuk hata-metni' }, `${o ? o.ortamAd : 'Bu'} ortamında giriş tarifi tanımlı değil.`));
    } catch (e) {
      govde.replaceChildren(h('p', { class: 'kucuk hata-metni' }, e.message || String(e)));
    }
  });
  return kutu;
}

function baglanti(etiketler, kapali = false) {
  return h('li', { class: `diyagram-baglantisi${kapali ? ' kapali' : ''}`, 'aria-hidden': etiketler.length ? null : 'true' },
    h('span', { class: 'cizgi', 'aria-hidden': 'true' }),
    etiketler.length ? h('span', { class: 'etiket' }, ikon('ok'), etiketler.join(', ')) : null);
}

/**
 * @param {HTMLElement} kap
 * @param {import('../senaryolar/akis-diyagrami.d.mts').AkisDiyagrami} d akisDiyagrami() sonucu
 * @param {{ durum: 'yeni' | 'yukleniyor' | 'hazir' | 'hata' | 'ekran'; sonuc?: { id: string; durum: string; zaman: string } | null; hata?: string; ortamAdi: string; not?: string;
 *   projeId?: string; ortamId?: string | null }} bilgi projeId/ortamId: giriş bloğunda tarifin okunur adımları ve tarif formu bağlantısı
 */
export function akisDiyagramiCiz(kap, d, bilgi) {
  const sonucVar = bilgi.durum === 'hazir' && bilgi.sonuc;
  const ust = h('div', { class: 'diyagram-ust' },
    h('div', { class: 'diyagram-kaynak' },
      bilgi.durum === 'ekran' ? h('span', { class: 'soluk' }, 'Ekranın akışı (tüm senaryolar). Koşu renkleri senaryo sayfasındaki “Akış diyagramı” sekmesinde.')
        : bilgi.durum === 'yeni' ? h('span', { class: 'soluk' }, 'Kaydedilmemiş senaryo: koşu sonucu yok.')
        : bilgi.durum === 'yukleniyor' ? h('span', { class: 'soluk' }, 'Son koşu okunuyor…')
          : bilgi.durum === 'hata' ? h('span', { class: 'hata-metni' }, `Son koşu okunamadı: ${bilgi.hata || ''}`)
            : sonucVar ? [h('span', { class: 'soluk' }, `Renkler: ${bilgi.ortamAdi} ortamındaki son koşu`),
              rozet(SONUC_DURUMLARI[bilgi.sonuc.durum] || bilgi.sonuc.durum, (DURUMLAR[bilgi.sonuc.durum] || DURUMLAR.kosulmadi).sinif),
              h('span', { class: 'mono cok-soluk kucuk' }, tarihMetni(bilgi.sonuc.zaman)),
              h('a', { class: 'dugme hayalet kucuk-dugme', href: `#/sonuclar/sonuc/${encodeURIComponent(bilgi.sonuc.id)}` }, 'Sonuç ayrıntısı', ikon('ok'))]
              : h('span', { class: 'soluk' }, `Bu senaryo ${bilgi.ortamAdi} ortamında henüz koşulmadı; adımlar renklenmez.`)),
    bilgi.durum === 'ekran' ? null : h('div', { class: 'diyagram-lejant', 'aria-label': 'Renklerin anlamı' },
      ['basarili', 'basarisiz', 'kosulmadi'].map((k) => h('span', { class: `lejant ${DURUMLAR[k].sinif}` }, DURUMLAR[k].etiket)),
      h('span', { class: 'lejant disarida' }, 'Bu senaryoda koşulmaz')));

  const akis = h('ol', { class: 'diyagram-akisi', 'aria-label': 'Senaryo akışı' });
  akis.append(h('li', { class: dugumSinifi(d.baslangic.sonuc, 'uc baslangic') },
    h('div', { class: 'dugum-basligi' }, h('span', { class: 'dugum-simgesi', 'aria-hidden': 'true' }, ikon(d.baslangic.girisVar ? 'kilit' : 'oynat')),
      h('h4', {}, d.baslangic.girisVar ? 'Giriş (ortam tarifi)' : 'Girişsiz'), durumCipi(d.baslangic.sonuc)),
    h('p', { class: 'dugum-aciklamasi' }, d.baslangic.metin),
    d.baslangic.girisVar ? girisAyrintisi(bilgi) : null,
    hataSatiri(d.baslangic.sonuc)));

  let onceki = [];
  let oncekiKapali = false;
  for (const a of d.adimlar) {
    const disarida = a.kosulur === false;
    akis.append(baglanti(onceki, oncekiKapali || disarida));
    const rozetler = [
      a.istegeBagli ? rozet(`isteğe bağlı: ${a.kapsamEtiketi}`, 'vurgu', { title: 'Senaryoda bu kutu işaretliyse adım koşulur.' })
        : a.kapsamEtiketi ? rozet(`koşul: ${a.kapsamEtiketi}`, 'vurgu', { title: 'Adım yalnızca bu koşulda koşulur.' }) : null,
      disarida ? rozet('bu senaryoda koşulmaz') : a.kosulur === null ? rozet('koşulup koşulmayacağı bilinmiyor', 'atlanan') : null,
      a.hedef === 'hata' ? rozet('hata beklenir', 'hata') : null
    ];
    akis.append(h('li', { class: dugumSinifi(disarida ? null : a.sonuc, `adim${disarida ? ' disarida' : ''}${a.hedef ? ` hedef-${a.hedef}` : ''}`), 'data-adim': a.id },
      h('div', { class: 'dugum-basligi' }, h('span', { class: 'dugum-no', 'aria-hidden': 'true' }, String(a.no)),
        h('h4', {}, a.baslik), ...rozetler, disarida ? null : durumCipi(a.sonuc)),
      a.altAkis ? h('p', { class: 'dugum-aciklamasi' }, `Alt akış: ${a.altAkis}`) : null,
      a.sqlOzeti ? h('p', { class: 'dugum-aciklamasi' }, ikon('veri'), ' ', a.sqlOzeti) : null,
      a.yenidenGiris ? h('p', { class: 'dugum-aciklamasi' }, ikon('kilit'), ' ', `Yeniden giriş: oturum kapatılır, ortamın giriş tarifiyle ${a.yenidenGiris.profil ? `“${a.yenidenGiris.profil}” profiliyle` : 'varsayılan profille'} girilir; akış aynı sayfadan sürer.`) : null,
      a.yenidenGiris ? girisAyrintisi(bilgi) : null,
      alanListesi(a.alanlar),
      !a.alanlar.length && !a.altAkis && !a.sqlOzeti && !a.yenidenGiris ? h('p', { class: 'dugum-aciklamasi soluk' }, 'Bu adımda doldurulan alan yok.') : null,
      disarida ? null : hataSatiri(a.sonuc)));
    if (!disarida) { onceki = a.aksiyonMetinleri; oncekiKapali = false; }
  }
  akis.append(baglanti(onceki));
  const bitisSonucu = d.bitis.durum ? { durum: d.bitis.durum === 'basarili' ? 'basarili' : d.bitis.durum === 'basarisiz' ? 'basarisiz' : d.bitis.durum, sureMs: null, hataMesaji: null } : null;
  akis.append(h('li', { class: dugumSinifi(bitisSonucu, `uc bitis bitis-${d.bitis.tur}`) },
    h('div', { class: 'dugum-basligi' }, h('span', { class: 'dugum-simgesi', 'aria-hidden': 'true' }, ikon(d.bitis.tur === 'hata' ? 'uyari' : 'hedef')),
      h('h4', {}, d.bitis.tur === 'hata' ? 'Beklenen sonuç: hata' : 'Beklenen sonuç: başarı'), durumCipi(bitisSonucu)),
    h('p', { class: 'dugum-aciklamasi' }, d.bitis.metin)));

  yerlestir(kap, ust,
    d.eslesmeyenler.length ? h('div', { class: 'not-kutusu uyari' },
      h('p', {}, `Son koşudaki ${d.eslesmeyenler.length} adım bu akışta yok (koşudan sonra ekranın modeli değişmiş olabilir): ${d.eslesmeyenler.join(', ')}.`)) : null,
    akis,
    h('p', { class: 'alan-notu' }, bilgi.not ?? 'Diyagram formdaki güncel seçimleri gösterir (kaydetmeden de değişir); akışın kendisi ekranın modelinden gelir.'));
}
