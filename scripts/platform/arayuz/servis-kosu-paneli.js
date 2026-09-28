// Servis testleri — canlı koşu paneli (ekran koşu paneliyle aynı görünüm: sağ altta, küçültülebilir).
// Senaryolar arka planda sırayla koşar (Ayarlar > Koşu > Servisler > "Aynı anda en çok N" > 1 ise en çok N'i aynı anda;
// POST /platform/servis/is/baslat); panel durumu kısa aralıkla sorar ve seçili senaryonun
// adımlarını gösterir: Parametreler hazırlandı → İstek gönderiliyor (sarı) → gönderildi (yeşil) → Cevap bekleniyor → Cevap geldi →
// Kontroller. İstek ve yanıt (gizli değerler maskeli) açılır kutularda. "Durdur" bekleyen isteği keser; "Tümünü durdur" işi durdurur.
import { api, h, ikon, rozet, yerlestir } from './ortak.js';
import { KOSU_DURUMLARI, canliOnayEki } from './kosu-paneli.js';

const SORGU_MS = 400;
const DURUMLAR = { ...KOSU_DURUMLARI, atlandi: KOSU_DURUMLARI.atlanan };
const ADIMLAR = [
  ['hazirlik', 'Parametreler hazırlanıyor', 'Parametreler hazırlandı'],
  ['gonderim', 'İstek gönderiliyor', 'İstek gönderildi'],
  ['yanit', 'Cevap bekleniyor', 'Cevap geldi'],
  ['kontroller', 'Kontroller değerlendiriliyor', 'Kontroller']
];
const sure = (ms) => (ms == null ? '' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1).replace('.', ',')} sn`);

/** Tek panel: { projeId, is, secili, kucuk, bitti } */
let durum = null;
let panelEl = null;
let zamanlayici = null;
/** Açık kalan istek / yanıt kutuları (yeniden çizimde kapanmasın). */
const acikKutular = new Set();

export const servisKosusuSuruyorMu = () => Boolean(durum && !durum.is.bitti);

/**
 * Koşuyu başlatır ve paneli açar. bitti(): koşu bitince (tabloyu yenilemek için) çağrılır.
 * @param {{ proje: { id: string }; servisId: string; ortamId: string; senaryoIdleri?: string[]; taslak?: { baslik: string; icerik: unknown }; tekrar?: { kaynakKosuId: string; veri?: string }; bitti?: () => void }} s
 */
export async function servisKosusuBaslat(s) {
  if (servisKosusuSuruyorMu()) throw new Error('Süren bir servis koşusu var; bitmesini bekleyin ya da durdurun.');
  // Riskli ortamda açık onay: koşu diyaloğunda onaylandıysa canliOnay: true gider (kosu-paneli.js > canliOnayEki).
  // tekrar: başarısızları tekrar çalıştırma ({ kaynakKosuId, veri }); sunucu o koşuda kalan çalıştırmaları kendi kaydından kurar.
  const { is } = await api('/platform/servis/is/baslat', { govde: { projeId: s.proje.id, servisId: s.servisId, ortamId: s.ortamId, ...canliOnayEki(s.ortamId),
    ...(s.tekrar ? { tekrar: s.tekrar } : s.taslak ? { taslak: s.taslak } : { senaryoIdleri: s.senaryoIdleri }) } });
  durum = { projeId: s.proje.id, is, secili: is.satirlar.find((x) => x.durum !== 'atlandi')?.senaryoId ?? is.satirlar[0]?.senaryoId, kucuk: false, bitti: s.bitti };
  acikKutular.clear();
  ciz();
  sorgula();
}

function sorgula() {
  clearTimeout(zamanlayici);
  if (!durum || durum.is.bitti) return;
  zamanlayici = setTimeout(async () => {
    try {
      const { is } = await api(`/platform/servis/is?projeId=${encodeURIComponent(durum.projeId)}&id=${encodeURIComponent(durum.is.id)}`);
      // Seçili senaryo bittiyse ve kullanıcı başka birini seçmediyse, çalışan senaryoya geç.
      const onceki = durum.is.satirlar.find((x) => x.senaryoId === durum.secili);
      if (is.calisanSenaryo && onceki && onceki.durum === 'calisiyor' && is.satirlar.find((x) => x.senaryoId === durum.secili)?.durum !== 'calisiyor') durum.secili = is.calisanSenaryo;
      durum.is = is;
      ciz();
      if (is.bitti) { durum.bitti?.(); return; }
    } catch { /* bağlantı kesintisi: sonraki denemede */ }
    sorgula();
  }, SORGU_MS);
}

async function durdur(senaryoId) {
  if (!durum) return;
  try { await api('/platform/servis/is/durdur', { govde: { projeId: durum.projeId, id: durum.is.id, ...(senaryoId ? { senaryoId } : {}) } }); } catch { /* sonraki sorguda görünür */ }
}

function durumSimgesi(d) {
  const g = DURUMLAR[d] || DURUMLAR.hata;
  if (d === 'calisiyor') return h('span', { class: 'donen-halka', role: 'img', 'aria-label': g.etiket });
  return h('span', { class: `durum-simgesi ${g.sinif}`, role: 'img', 'aria-label': g.etiket }, ikon(g.ikon));
}

/** Seçili senaryonun adım zaman çizelgesi. */
function adimlar(satir) {
  const ol = h('ol', { class: 'servis-adimlari', 'aria-label': 'Adımlar' });
  for (const [ad, surerken, bitince] of ADIMLAR) {
    const olaylar = satir.olaylar.filter((o) => o.adim === ad);
    if (!olaylar.length) {
      if (satir.durum === 'calisiyor' || satir.durum === 'sirada') ol.append(h('li', { class: 'bekliyor' }, h('span', { class: 'nokta' }), surerken));
      continue;
    }
    const son = olaylar[olaylar.length - 1];
    const b = son.bilgi || {};
    const ek = ad === 'yanit' && son.durum === 'tamam' ? ` (HTTP ${b.durumKodu}, ${sure(b.sureMs)})`
      : ad === 'kontroller' && b.toplam != null ? `: ${b.gecen}/${b.toplam} geçti` : '';
    const metin = son.durum === 'basladi' ? `${surerken}…` : son.durum === 'hata' ? `${surerken} — hata${b.mesaj ? `: ${b.mesaj}` : ''}` : `${bitince}${ek}`;
    ol.append(h('li', { class: son.durum === 'basladi' ? 'suruyor' : son.durum === 'hata' ? 'hata' : 'tamam' }, h('span', { class: 'nokta' }), metin));
  }
  return ol;
}

/** Kontrol sonuçları (VEYA ve sözleşme uyumsuzlukları iç içe). */
function kontrolListesi(liste) {
  return h('ul', { class: 'kontrol-listesi' }, liste.map((k) => h('li', { class: k.gecti ? 'gecti' : 'kaldi' },
    h('div', {}, ikon(k.gecti ? 'onay' : 'carpi'), ` ${k.tur === 'veya' ? 'Şunlardan biri (VEYA)' : k.ad}${k.aciklama ? ' — ' : ''}`, h('span', { class: 'soluk' }, k.aciklama)),
    Array.isArray(k.alt) && k.alt.length ? kontrolListesi(k.alt) : null)));
}

function kutu(anahtar, baslik, metin) {
  const d = h('details', { open: acikKutular.has(anahtar) }, h('summary', {}, baslik), h('pre', { class: 'hata-mesaji kod-blogu' }, metin));
  d.addEventListener('toggle', () => { d.open ? acikKutular.add(anahtar) : acikKutular.delete(anahtar); });
  return d;
}

function ciz() {
  if (!durum) { panelEl?.remove(); panelEl = null; return; }
  const is = durum.is;
  const toplam = is.satirlar.length;
  const biten = is.satirlar.filter((x) => !['calisiyor', 'sirada'].includes(x.durum)).length;
  const say = (d) => is.satirlar.filter((x) => x.durum === d).length;
  const enCok = Number(is.eszamanli) > 1 ? Number(is.eszamanli) : 1;
  if (!panelEl) {
    panelEl = h('section', { class: 'kosu-paneli servis-kosu-paneli', role: 'region', 'aria-label': 'Servis koşu paneli' });
    document.body.append(panelEl);
  }
  panelEl.classList.toggle('kucuk', durum.kucuk);
  const kucult = h('button', { type: 'button', class: 'ikon-dugme hayalet', 'aria-label': durum.kucuk ? 'Paneli aç' : 'Paneli küçült', title: durum.kucuk ? 'Aç' : 'Küçült', onclick: () => { durum.kucuk = !durum.kucuk; ciz(); } }, ikon(durum.kucuk ? 'genislet' : 'eksi'));
  const kapat = h('button', { type: 'button', class: 'ikon-dugme hayalet', 'aria-label': 'Paneli kapat', title: 'Kapat', onclick: () => { durum = null; ciz(); } }, ikon('carpi'));
  const baslik = h('div', { class: 'panel-baslik' },
    h('div', { class: 'satir' },
      h('h2', {}, is.bitti ? ikon('onay') : h('span', { class: 'donen-halka', 'aria-hidden': 'true' }), is.bitti ? 'Servis koşusu bitti' : 'Servis koşusu sürüyor'),
      h('div', { class: 'dugmeler' },
        !is.bitti ? h('button', { type: 'button', class: 'kucuk-dugme tehlike', onclick: () => durdur() }, h('span', { class: 'kare-simge', 'aria-hidden': 'true' }), 'Tümünü durdur') : null,
        kucult, is.bitti ? kapat : null)),
    h('div', { class: 'alt' }, h('span', {}, is.servisAd), h('span', {}, `${is.ortam} · ${toplam} senaryo · ${enCok > 1 ? `aynı anda en çok ${enCok}` : 'sırayla'}`)),
    durum.kucuk ? null : h('div', { class: 'ilerleme-satiri' }, h('progress', { max: String(toplam), value: String(biten), 'aria-label': `İlerleme: ${biten} / ${toplam}` }),
      h('span', { class: 'yuzde' }, `%${toplam ? Math.round((biten / toplam) * 100) : 0}`)),
    durum.kucuk ? null : h('div', { class: 'kosu-sayaclari' },
      say('basarili') ? rozet(`${say('basarili')} başarılı`, 'basari') : null, say('basarisiz') ? rozet(`${say('basarisiz')} başarısız`, 'hata') : null,
      say('hata') ? rozet(`${say('hata')} çalıştırılamadı`, 'hata') : null, say('durduruldu') ? rozet(`${say('durduruldu')} durduruldu`, 'durdu') : null,
      say('atlandi') ? rozet(`${say('atlandi')} atlandı`, 'atlanan') : null,
      // Eşzamanlı koşu (Ayarlar > Koşu > Servisler): "N senaryo aynı anda (en çok M)"; sırayla koşuda "1 çalışıyor".
      say('calisiyor') ? rozet(enCok > 1 ? `${say('calisiyor')} senaryo aynı anda (en çok ${enCok})` : `${say('calisiyor')} çalışıyor`, 'vurgu') : null,
      say('sirada') ? rozet(`${say('sirada')} sırada`) : null));
  if (durum.kucuk) { yerlestir(panelEl, baslik); return; }
  const liste = h('ul', { class: 'kosu-listesi', 'aria-label': 'Koşudaki senaryolar' }, is.satirlar.map((x) => {
    const secili = x.senaryoId === durum.secili;
    const gecen = x.baslangic ? (x.bitis || Date.now()) - x.baslangic : null;
    const li = h('li', { class: secili ? 'secili' : null, tabindex: '0', 'aria-current': secili ? 'true' : null },
      durumSimgesi(x.durum),
      h('span', { class: 'ad' }, h('span', { title: x.baslik }, x.baslik), h('small', {}, x.neden || (DURUMLAR[x.durum] || {}).etiket || x.durum)),
      h('span', { class: 'sag' }, sure(gecen),
        x.durum === 'calisiyor' || x.durum === 'sirada'
          ? h('button', { type: 'button', class: 'kucuk-dugme durdur-dugmesi', 'aria-label': `Durdur: ${x.baslik}`, onclick: (o) => { o.stopPropagation(); durdur(x.senaryoId); } }, 'Durdur')
          : null));
    const sec = () => { durum.secili = x.senaryoId; ciz(); };
    li.addEventListener('click', sec);
    li.addEventListener('keydown', (o) => { if (o.key === 'Enter' || o.key === ' ') { o.preventDefault(); sec(); } });
    return li;
  }));
  const satir = is.satirlar.find((x) => x.senaryoId === durum.secili) || is.satirlar[0];
  const g = DURUMLAR[satir.durum] || DURUMLAR.hata;
  const kontroller = satir.sonuc && Array.isArray(satir.sonuc.kontroller) ? satir.sonuc.kontroller : [];
  const izleme = h('div', { class: 'kosu-izleme' },
    h('div', { class: 'izleme-basligi' }, h('span', { title: satir.baslik }, satir.baslik),
      satir.durum === 'calisiyor' ? h('span', { class: 'canli-rozeti', title: 'Koşu sürüyor' }, 'SÜRÜYOR') : rozet(g.etiket, g.sinif === 'sirada' ? '' : g.sinif)),
    satir.durum === 'atlandi' ? h('p', { class: 'soluk kucuk' }, satir.neden || 'Atlandı.') : adimlar(satir),
    satir.sonuc && satir.sonuc.yetkiTekrari ? h('p', { class: 'not-kutusu bilgi yetki-notu' }, satir.sonuc.yetkiTekrari.not) : null,
    kontroller.length ? kontrolListesi(kontroller) : null,
    satir.istek ? kutu(`${satir.senaryoId}:istek`, 'İstek (gizli değerler maskeli)', satir.istek) : null,
    satir.yanit ? kutu(`${satir.senaryoId}:yanit`, `Yanıt${satir.sonuc && satir.sonuc.durumKodu ? ` (HTTP ${satir.sonuc.durumKodu})` : ''}`, satir.yanit) : null,
    satir.sonuc && satir.sonuc.kosuId ? h('div', { class: 'panel-eylemleri' },
      h('a', { class: 'dugme kucuk-dugme', href: `#/servisler/s/${encodeURIComponent(is.servisId)}/raporlar/${encodeURIComponent(satir.sonuc.kosuId)}` }, 'Rapor', ikon('ok'))) : null);
  yerlestir(panelEl, baslik, liste, izleme);
}
