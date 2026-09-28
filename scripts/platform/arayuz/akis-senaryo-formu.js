// SERVİS SENARYOSU TÜRÜ SEÇİMİ + AKIŞ SENARYOSU FORMU (servis sayfası > Senaryo ekle / bir akış senaryosu).
//   Yeni senaryoda en üstte karşılıklı dışlayıcı seçim: "Tek istek (operasyon)" → mevcut senaryo düzenleyicisi aynen;
//   "Akış" → bu form: Başlık, Akış (akışı bu servisten geçenler; "Tüm akışları göster" ile projedekilerin tümü), Kapsam, Koşuya
//   dahil ve akışın HER OPERASYON ADIMI için ayrı bölüm ("1. SiparisServisi · CreateOrder"): o metodun zorunlu / seçili alanları
//   (metot ayarlarındaki zorunlu işaretleri, tablo ve hesaplama kuralı bağları, servis varsayılanları; "Tüm alanlar" ile hepsi),
//   akıştan gelen alanlar KİLİTLİ ("1. adımdan gelir (${akis:OrderNo})"; sorulmaz), adımın beklenen sonucu (kontroller).
//   Aynı adlı alan her adımda ayrı sorulur. Akıştaki bir operasyon CANLI'da çağrılmıyorsa CANLI kapsamı seçilemez (neden yazılı).
//   Adres: #/servisler/s/<id>/senaryo/yeni?akis=<akisId> (akış sayfasındaki "Senaryo ekle") akış seçili açılır.
// Kayıt: POST /platform/servis/akis-senaryosu/kaydet (içerik: { tur: 'akis', akisId, adimlar: { <adımId>: tek istekli içerik } }).
// Dene: kaydedilmemiş hâli TEST ortamında (onayla; canlı koşu paneli). Kullanıcı verisi DOM'a yalnız metin olarak yazılır.
import { alan, alanHatasi, api, bildir, h, ikon, mesajKutusu, mesgulIken, rozet, yeniKimlik, yerlestir } from './ortak.js';
import { onayIste, riskliOrtamMi } from './kosu-paneli.js';
import { servisKosusuBaslat } from './servis-kosu-paneli.js';
import { alanSatirlari, baslangicDegerleri, govdeCoz, govdeUret, sabitDegerUyarisi } from './servis-govdesi.mjs';
import { basvuru } from './tablo-secimi.mjs';
import { dosyaKontroluFormu, yeniDosyaTanimi } from './dosya-kontrolu-formu.js';

const q = encodeURIComponent;
const KAPSAM = { test: 'TEST', canli: 'CANLI', ikisi: 'TEST + CANLI' };
const KAYNAK_ETIKETI = { sabit: 'Sabit değer', tablo: 'Tablodan', parametre: 'Hesaplama kuralı', akis: 'Akış değeri', bos: 'Boş gönder', nil: 'Boş (nil)', gonderme: 'Gönderme' };
const KONTROL_TURLERI = [
  ['soapYaniti', 'Yanıt geçerli SOAP zarfı'], ['soapHatasiYok', 'SOAP hatası (Fault) yok'], ['soapHatasi', 'SOAP hatası (Fault) döner'],
  ['icerir', 'Yanıtta geçer'], ['icermez', 'Yanıtta geçmez'], ['xpathEsit', 'XPath değeri eşit'], ['jsonEsit', 'JSON değeri eşit'], ['durumKodu', 'HTTP durum kodu'],
  ['dosya', 'Yanıttaki dosyayı doğrula']
];
const DEGERLI = new Set(['icerir', 'icermez', 'xpathEsit', 'jsonEsit', 'durumKodu']);

/** "yeni?akis=<id>" → akış kimliği. @param {string | null} altKimlik */
const akisParametresi = (altKimlik) => {
  const m = /[?&]akis=([^&]+)/.exec(altKimlik || '');
  return m ? decodeURIComponent(m[1]) : null;
};

/**
 * Senaryo sayfası: türe göre akış formu ya da mevcut düzenleyici (klasik). Yeni senaryoda tür seçimi en üstte.
 * @param {HTMLElement} kap @param {{ id: string }} proje @param {any} s servis @param {any[]} ortamlar @param {any | null} senaryo
 * @param {string | null} altKimlik @param {(kap: HTMLElement) => Promise<void>} klasik
 */
export async function senaryoSayfasi(kap, proje, s, ortamlar, senaryo, altKimlik, klasik) {
  if (senaryo && senaryo.icerik?.tur !== 'akis') { await klasik(kap); return; }
  if (senaryo) { await akisSenaryoFormu(kap, proje, s, ortamlar, senaryo, senaryo.icerik.akisId); return; }
  const akisId = akisParametresi(altKimlik);
  let tur = akisId ? 'akis' : 'operasyon';
  const govde = h('div', {});
  const secim = h('div', { class: 'segment senaryo-turu', role: 'radiogroup', 'aria-label': 'Senaryo türü' });
  const ciz = async () => {
    yerlestir(secim, ...[['operasyon', 'Tek istek (operasyon)'], ['akis', 'Akış']].map(([d, m]) => h('button', {
      type: 'button', role: 'radio', 'aria-checked': tur === d ? 'true' : 'false', 'aria-pressed': tur === d ? 'true' : 'false',
      onclick: () => { if (tur !== d) { tur = d; void ciz(); } }
    }, m)));
    yerlestir(govde, h('p', { class: 'soluk' }, 'Yükleniyor…'));
    if (tur === 'akis') await akisSenaryoFormu(govde, proje, s, ortamlar, null, akisId);
    else await klasik(govde);
  };
  yerlestir(kap,
    h('div', { class: 'kart senaryo-turu-karti' },
      h('div', { class: 'satir-duzen' }, h('span', { class: 'tasarim-etiketi' }, h('span', {}, 'Senaryo türü')), secim),
      h('p', { class: 'soluk kucuk' }, 'Tek istek: bir operasyona istek atılır. Akış: bir servis akışının operasyonları sırayla çağrılır; her adımın alanları ayrı sorulur, önceki adımdan gelen değerler kilitlidir.')),
    govde);
  await ciz();
}

/**
 * Akış senaryosu formu.
 * @param {HTMLElement} kap @param {{ id: string }} proje @param {any} s @param {any[]} ortamlar @param {any | null} senaryo @param {string | null} baslangicAkisi
 */
async function akisSenaryoFormu(kap, proje, s, ortamlar, senaryo, baslangicAkisi) {
  const [{ akislar }, { tablolar }] = await Promise.all([
    api(`/platform/servis-akislari?projeId=${q(proje.id)}`),
    api(`/platform/tablolar?projeId=${q(proje.id)}`).catch(() => ({ tablolar: [] }))
  ]);
  const uygun = akislar.filter((a) => a.tur === 'akis' && !a.icerik?.uctanUca);
  const gecen = (a) => (a.icerik?.adimlar ?? []).some((x) => x.servisId === s.id);
  let tumu = Boolean(baslangicAkisi && !uygun.some((a) => a.id === baslangicAkisi && gecen(a)));
  let akisId = baslangicAkisi || '';
  /** Adım kimliği → { degerler | govde, kontroller, http? } (akış değişince sıfırlanır). */
  const eski = senaryo ? JSON.parse(JSON.stringify(senaryo.icerik.adimlar || {})) : {};
  /** @type {any} */
  let form = null;
  /** Adım durumları: { adim, degerler?, govdeG?, http?, kontroller } */
  let durumlar = [];

  const mesaj = mesajKutusu();
  const baslik = h('input', { type: 'text', autocomplete: 'off', value: senaryo ? senaryo.baslik : '' });
  const kapsam = h('select', {}, Object.entries(KAPSAM).map(([k, m]) => h('option', { value: k, selected: (senaryo?.kapsam || 'test') === k }, m)));
  const kapsamNotu = h('div', { class: 'yardim' });
  const dahil = h('input', { type: 'checkbox', id: yeniKimlik('dahil'), checked: senaryo ? senaryo.kosuyaDahil : true });
  const akisSec = h('select', {});
  const tumuKutu = h('input', { type: 'checkbox', id: yeniKimlik('tumu'), checked: tumu });
  const adimKap = h('div', { class: 'akis-senaryo-adimlari' });
  const akisSecCiz = () => {
    const liste = uygun.filter((a) => tumu || gecen(a) || a.id === akisId);
    yerlestir(akisSec, h('option', { value: '' }, liste.length ? '— akış seçin —' : 'Bu servisten geçen akış yok'),
      liste.map((a) => h('option', { value: a.id, selected: a.id === akisId }, `${a.baslik} (${a.adimSayisi} adım)`)));
  };
  akisSecCiz();
  tumuKutu.addEventListener('change', () => { tumu = tumuKutu.checked; akisSecCiz(); });
  akisSec.addEventListener('change', () => { akisId = akisSec.value; void adimlariYukle(); });

  const bagBasvurusu = (b) => {
    const t = b ? tablolar.find((x) => x.id === b.tablo) : null;
    return t && t.sutunlar.some((c) => c.ad === b.sutun) ? basvuru(t.ad, b.sutun, b.etiket || '', b.bicim || '') : '';
  };

  async function adimlariYukle() {
    form = null;
    durumlar = [];
    if (!akisId) { yerlestir(adimKap, h('p', { class: 'soluk' }, 'Akış seçin: akıştaki her operasyon için alanlar burada sorulur.')); kapsamDenetle(); return; }
    yerlestir(adimKap, h('p', { class: 'soluk' }, 'Akış okunuyor…'));
    try { form = await api(`/platform/servis/akis-senaryo-formu?projeId=${q(proje.id)}&akisId=${q(akisId)}`); } catch (e) { yerlestir(adimKap, h('div', { class: 'not-kutusu hata', role: 'alert' }, e.message)); return; }
    durumlar = form.adimlar.map((a) => adimDurumu(a));
    kapsamDenetle();
    yerlestir(adimKap,
      form.adimlar.length ? null : h('div', { class: 'not-kutusu uyari' }, 'Bu akışta operasyon adımı yok. Akış tasarımında “+ > Operasyon” ile ekleyin.'),
      ...durumlar.map((d) => adimBolumu(d)));
  }

  /** Adımın başlangıç durumu: senaryodaki içerik, yoksa operasyonun varsayılanı; kilitli alanlar akış değeri. */
  function adimDurumu(a) {
    const ic = eski[a.id] && eski[a.id].operasyon === a.operasyon ? eski[a.id] : a.varsayilanIcerik;
    const d = { adim: a, kontroller: JSON.parse(JSON.stringify(ic?.kontroller ?? [{ tur: a.servis?.tur === 'rest' ? 'durumKodu' : 'soapYaniti', ...(a.servis?.tur === 'rest' ? { deger: '200-299' } : {}) }])),
      http: ic?.http ? { ...ic.http } : undefined, basliklar: ic?.basliklar, tumAlanlar: false, degerler: null, govdeG: null };
    if (a.sema) {
      const c = ic?.govde ? govdeCoz(ic.govde, a.sema) : { degerler: baslangicDegerleri(a.sema, a.alanVarsayilanlari || {}), uyumsuz: [] };
      if (!c.uyumsuz.length || !ic?.govde) d.degerler = c.degerler;
      else d.govdeG = ic.govde;
    } else d.govdeG = ic?.govde ?? '';
    if (d.degerler) {
      // Bağlı alanlar (tablo / hesaplama kuralı) yeni senaryoda o kaynakla başlar; akıştan gelenler kilitli.
      if (!eski[a.id]) {
        for (const [yol, b] of Object.entries(a.alanBaglari || {})) {
          if (!(yol in d.degerler) || (a.alanVarsayilanlari || {})[yol]) continue;
          if (b.kural) d.degerler[yol] = { kaynak: 'parametre', deger: b.kural };
          else { const ref = bagBasvurusu(b); if (ref) d.degerler[yol] = { kaynak: 'tablo', deger: ref }; }
        }
      }
      for (const k of a.kilitli) d.degerler[k.yol] = { kaynak: 'akis', deger: k.ad };
    }
    return d;
  }

  function kapsamDenetle() {
    const engel = form?.canliEngeli ?? [];
    for (const o of kapsam.options) o.disabled = engel.length > 0 && o.value !== 'test';
    if (engel.length && kapsam.value !== 'test') kapsam.value = 'test';
    kapsamNotu.textContent = engel.length ? `CANLI seçilemez: ${engel.join('; ')}.` : 'Hangi ortam türünde koşacağı. Dene her zaman TEST’te.';
  }

  /** Bir operasyon adımının bölümü: alanlar (kilitliler sorulmaz) + beklenen sonuç. */
  function adimBolumu(d) {
    const a = d.adim;
    const etiket = `${a.no}. ${a.servis?.ad ?? '?'} · ${a.operasyon}`;
    if (!a.servis) return h('fieldset', { class: 'akis-senaryo-adimi' }, h('legend', {}, etiket), h('p', { class: 'hata-metni' }, a.hata || 'Servis bulunamadı.'));
    const alanKap = h('div', {});
    const kilitliYollar = new Set(a.kilitli.map((k) => k.yol));
    const kilitNotu = (yol) => {
      const k = a.kilitli.find((x) => x.yol === yol);
      return k ? `${k.ureten ? `${k.ureten}. adımdan gelir` : 'akıştan gelir'} (\${akis:${k.ad}})` : '';
    };
    const alanlariCiz = () => {
      if (!d.degerler) {
        const g = h('textarea', { class: 'kod-alani', rows: 10, spellcheck: 'false', 'aria-label': `${a.no}. adım istek gövdesi` });
        g.value = d.govdeG ?? '';
        g.addEventListener('input', () => { d.govdeG = g.value; });
        yerlestir(alanKap,
          a.servis.tur === 'rest' && d.http ? h('p', { class: 'kucuk' }, h('code', { class: 'duz' }, `${d.http.metot} ${d.http.yol || '/'}`)) : null,
          a.sema ? h('div', { class: 'not-kutusu uyari' }, 'Kayıtlı gövde alan formunda gösterilemiyor; gövde metin olarak düzenlenir.') : null,
          alan(a.servis.tur === 'rest' ? 'İstek gövdesi (JSON)' : 'İstek gövdesi (SOAP zarfı)', g, { yardim: 'Değerler ${Tablo.Sütun}, ${akis:Ad} ya da hesaplama kuralıyla yazılabilir.' }),
          a.kilitli.length ? h('p', { class: 'soluk kucuk' }, 'Akıştan gelen alanlar (koşuda yazılır, sorulmaz): ', ...a.kilitli.map((k) => h('code', { class: 'akis-degeri' }, `${k.yol} ← \${akis:${k.ad}}`))) : null);
        return;
      }
      const zorunlu = (yol, alanT) => (Array.isArray(a.zorunlular) ? a.zorunlular.includes(yol) : Boolean(alanT.zorunlu));
      const secili = (yol, alanT) => zorunlu(yol, alanT) || kilitliYollar.has(yol) || Boolean((a.alanBaglari || {})[yol]) || Boolean((a.alanVarsayilanlari || {})[yol])
        || (d.degerler[yol] && d.degerler[yol].kaynak !== 'gonderme');
      const satirlar = alanSatirlari(a.sema.alanlar).filter((x) => !x.grup && (d.tumAlanlar || secili(x.yol, x.alan)));
      const tablo = h('div', { class: 'alan-formu', role: 'table', 'aria-label': `${etiket} alanları` });
      for (const sat of satirlar) {
        const v = d.degerler[sat.yol] ??= { kaynak: 'gonderme' };
        const z = zorunlu(sat.yol, sat.alan);
        const ad = h('span', { class: 'alan-adi', role: 'cell', title: sat.yol }, sat.alan.ad, z ? h('span', { class: 'zorunlu-isaret', title: 'Zorunlu alan' }, '*') : null);
        if (kilitliYollar.has(sat.yol)) {
          tablo.append(h('div', { class: 'alan-satiri kilitli', role: 'row' }, ad,
            h('span', { role: 'cell' }, rozet('kilitli', 'vurgu', { title: 'Değer akıştan gelir; senaryoda sorulmaz' })),
            h('span', { role: 'cell', class: 'alan-degeri' }, ikon('kilit'), ' ', kilitNotu(sat.yol))));
          continue;
        }
        const satir = h('div', { class: `alan-satiri${z ? ' zorunlu' : ''}`, role: 'row' });
        const degerCiz = () => {
          const kaynak = h('select', { 'aria-label': `${a.no}. adım ${sat.alan.ad} değer kaynağı` }, Object.entries(KAYNAK_ETIKETI).map(([k, m]) => h('option', { value: k, selected: v.kaynak === k }, m)));
          kaynak.addEventListener('change', () => { v.kaynak = kaynak.value; if (!['sabit', 'tablo', 'parametre', 'akis'].includes(v.kaynak)) delete v.deger; else v.deger = ''; degerCiz(); });
          let girdi = null;
          const not = h('span', { class: 'alan-uyarisi', 'aria-live': 'polite' });
          if (v.kaynak === 'sabit') {
            girdi = sat.alan.secenekler && sat.alan.secenekler.length
              ? h('select', { 'aria-label': `${a.no}. adım ${sat.alan.ad}` }, h('option', { value: '' }, '—'), sat.alan.secenekler.map((x) => h('option', { value: x, selected: v.deger === x }, x)))
              : h('input', { type: 'text', value: v.deger || '', autocomplete: 'off', spellcheck: 'false', 'aria-label': `${a.no}. adım ${sat.alan.ad}` });
            girdi.addEventListener(girdi.tagName === 'SELECT' ? 'change' : 'input', () => { v.deger = girdi.value; not.textContent = sabitDegerUyarisi(sat.alan, v.deger) || ''; });
          } else if (v.kaynak === 'tablo') {
            girdi = h('select', { 'aria-label': `${a.no}. adım ${sat.alan.ad} tablo sütunu` }, h('option', { value: '' }, '— tablo sütunu —'),
              tablolar.map((t) => h('optgroup', { label: t.ad }, t.sutunlar.map((c) => h('option', { value: basvuru(t.ad, c.ad), selected: v.deger === basvuru(t.ad, c.ad) }, `${t.ad} → ${c.ad}`)))),
              v.deger && !tablolar.some((t) => t.sutunlar.some((c) => basvuru(t.ad, c.ad) === v.deger)) ? h('option', { value: v.deger, selected: true }, v.deger) : null);
            girdi.addEventListener('change', () => { v.deger = girdi.value; });
          } else if (v.kaynak === 'parametre') {
            const kurallar = a.servis.tarihKurallari || [];
            girdi = h('select', { 'aria-label': `${a.no}. adım ${sat.alan.ad} hesaplama kuralı` }, h('option', { value: '' }, kurallar.length ? '— kural —' : 'Serviste kural yok'),
              kurallar.map((k) => h('option', { value: k, selected: v.deger === k }, k)), v.deger && !kurallar.includes(v.deger) ? h('option', { value: v.deger, selected: true }, `${v.deger} (tanımsız)`) : null);
            girdi.addEventListener('change', () => { v.deger = girdi.value; });
          } else if (v.kaynak === 'akis') {
            girdi = h('input', { type: 'text', value: v.deger || '', maxlength: '60', spellcheck: 'false', class: 'kod-girdisi', placeholder: 'OrderNo', 'aria-label': `${a.no}. adım ${sat.alan.ad} akış değeri adı` });
            girdi.addEventListener('input', () => { v.deger = girdi.value.trim(); });
          }
          yerlestir(satir, ad, h('span', { role: 'cell' }, kaynak),
            h('span', { role: 'cell', class: 'alan-degeri' }, girdi ?? h('span', { class: 'soluk kucuk' }, v.kaynak === 'gonderme' ? 'gövdeye yazılmaz' : v.kaynak === 'bos' ? `<${sat.alan.ad}/>` : `<${sat.alan.ad} xsi:nil="true"/>`), not));
        };
        degerCiz();
        tablo.append(satir);
      }
      const tumKutu = h('input', { type: 'checkbox', id: yeniKimlik('tum'), checked: d.tumAlanlar });
      tumKutu.addEventListener('change', () => { d.tumAlanlar = tumKutu.checked; alanlariCiz(); });
      yerlestir(alanKap,
        h('div', { class: 'alan-formu-ust' }, h('label', { class: 'secenek', for: tumKutu.id }, tumKutu, 'Tüm alanları göster'),
          h('span', { class: 'soluk kucuk' }, `${satirlar.length} alan · zorunlu / bağlı / dolu alanlar gösteriliyor`)),
        satirlar.length ? tablo : h('p', { class: 'soluk kucuk' }, 'Gösterilecek alan yok (“Tüm alanları göster”).'));
    };
    alanlariCiz();
    const kontrolKap = h('div', {});
    const kontrolCiz = () => {
      yerlestir(kontrolKap, h('div', { class: 'akis-kontrol-listesi' },
        ...d.kontroller.map((k, i) => {
          const tur = h('select', { 'aria-label': `${a.no}. adım ${i + 1}. kontrol türü` }, KONTROL_TURLERI.map(([t, m]) => h('option', { value: t, selected: k.tur === t }, m)),
            KONTROL_TURLERI.some(([t]) => t === k.tur) ? null : h('option', { value: k.tur, selected: true }, k.tur));
          tur.addEventListener('change', () => { k.tur = tur.value; if (k.tur === 'dosya') k.dosya ||= yeniDosyaTanimi(); else delete k.dosya; kontrolCiz(); });
          // Dosya kontrolü: adımın yanıt gövdesi dosya olarak beklentilerle doğrulanır.
          if (k.tur === 'dosya') {
            return h('div', { class: 'akis-kontrol-satiri' }, tur,
              h('button', { type: 'button', class: 'kucuk-dugme', 'aria-label': `${a.no}. adım ${i + 1}. kontrolü kaldır`, onclick: () => { d.kontroller.splice(i, 1); kontrolCiz(); } }, ikon('carpi')),
              h('div', { class: 'kontrol-dosyasi' }, dosyaKontroluFormu(k.dosya ||= yeniDosyaTanimi(), { degisti: () => undefined, ad: `${a.no}. adım ${i + 1}. kontrol` })));
          }
          const deger = h('input', { type: 'text', value: k.deger || '', autocomplete: 'off', spellcheck: 'false', placeholder: k.tur === 'durumKodu' ? '200 ya da 200-299' : 'Metin', 'aria-label': `${a.no}. adım ${i + 1}. kontrol değeri` });
          deger.addEventListener('input', () => { k.deger = deger.value; });
          const yol = h('input', { type: 'text', value: k.tur === 'jsonEsit' ? k.yol || '' : k.xpath || '', autocomplete: 'off', spellcheck: 'false', placeholder: k.tur === 'jsonEsit' ? 'data.id' : '//Durum', 'aria-label': `${a.no}. adım ${i + 1}. kontrol yolu` });
          yol.addEventListener('input', () => { if (k.tur === 'jsonEsit') k.yol = yol.value; else k.xpath = yol.value; });
          return h('div', { class: 'akis-kontrol-satiri' }, tur, k.tur === 'xpathEsit' || k.tur === 'jsonEsit' ? yol : null, DEGERLI.has(k.tur) ? deger : null,
            h('button', { type: 'button', class: 'kucuk-dugme', 'aria-label': `${a.no}. adım ${i + 1}. kontrolü kaldır`, onclick: () => { d.kontroller.splice(i, 1); kontrolCiz(); } }, ikon('carpi')));
        }),
        h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => { d.kontroller.push({ tur: 'icerir', deger: '' }); kontrolCiz(); } }, ikon('arti'), 'Kontrol ekle')));
    };
    kontrolCiz();
    return h('fieldset', { class: 'akis-senaryo-adimi' },
      h('legend', {}, etiket, a.ad && a.ad !== a.operasyon ? h('span', { class: 'soluk kucuk' }, ` — ${a.ad}`) : null, a.yalnizTest ? rozet('yalnız TEST', 'uyari') : null),
      alanKap,
      h('h4', { class: 'ayrinti-basligi' }, 'Beklenen sonuç (bu adım)'),
      h('p', { class: 'soluk kucuk' }, 'Varsayılan: operasyonun olağan kontrolü. Bu adımın bir hata vermesi bekleniyorsa ör. “Yanıtta geçer” + hata metni ekleyin.'),
      kontrolKap);
  }

  /** Formdan içerik (adım başına tek istekli senaryo içeriği). */
  function icerikAl() {
    /** @type {Record<string, any>} */
    const adimlar = {};
    for (const d of durumlar) {
      const a = d.adim;
      if (!a.servis) continue;
      for (const [yol, v] of Object.entries(d.degerler || {})) {
        if (['tablo', 'parametre', 'akis'].includes(v.kaynak) && !v.deger) throw new Error(`${a.no}. adım: "${yol}" alanında ${v.kaynak === 'tablo' ? 'tablo sütunu' : v.kaynak === 'akis' ? 'akış değeri adı' : 'hesaplama kuralı'} seçilmedi.`);
      }
      const govde = d.degerler ? govdeUret(a.sema, d.degerler, { soapSurumu: a.servis.soapSurumu }) : d.govdeG ?? '';
      adimlar[a.id] = {
        operasyon: a.operasyon, govde,
        kontroller: d.kontroller.map((k) => Object.fromEntries(Object.entries(k).filter(([, x]) => x !== '' && x !== undefined))),
        ...(d.http ? { http: d.http } : {}), ...(d.basliklar ? { basliklar: d.basliklar } : {})
      };
    }
    return { tur: 'akis', akisId, adimlar };
  }

  const kaydet = h('button', { type: 'button', class: 'birincil' }, 'Kaydet');
  kaydet.addEventListener('click', async () => {
    mesaj.temizle();
    if (!baslik.value.trim()) { alanHatasi(baslik, 'Başlık boş olamaz.'); baslik.focus(); return; }
    if (!akisId) { mesaj.goster('Akış seçin.'); return; }
    let icerik;
    try { icerik = icerikAl(); } catch (e) { mesaj.goster(e.message); return; }
    try {
      const r = await mesgulIken(kaydet, 'Kaydediliyor…', () => api('/platform/servis/akis-senaryosu/kaydet', { govde: {
        projeId: proje.id, servisId: senaryo?.servisId ?? s.id, id: senaryo?.id, baslik: baslik.value.trim(), kapsam: kapsam.value, kosuyaDahil: dahil.checked, icerik
      } }));
      bildir('Senaryo kaydedildi.');
      location.hash = `#/servisler/s/${q(senaryo?.servisId ?? s.id)}/senaryo/${q(r.id)}`;
    } catch (e) { mesaj.goster(e.message); }
  });
  const test = ortamlar.find((o) => !riskliOrtamMi(o));
  const dene = h('button', { type: 'button', disabled: !test, title: 'Kaydedilmemiş hâliyle TEST ortamında dener; senaryo kaydedilmez' }, ikon('oynat'), 'Dene (TEST)');
  dene.addEventListener('click', async () => {
    mesaj.temizle();
    if (!akisId) { mesaj.goster('Akış seçin.'); return; }
    let icerik;
    try { icerik = icerikAl(); } catch (e) { mesaj.goster(e.message); return; }
    const liste = durumlar.map((d) => `${d.adim.no}. ${d.adim.servis?.ad ?? '?'} · ${d.adim.operasyon}`);
    if (!(await onayIste({ baslik: 'TEST ortamına istek atılsın mı?', metin: `Akışın adımları sırayla "${test.ad}" ortamında çalıştırılacak.`, liste, dugme: 'Dene', ikonAd: 'ag' }))) return;
    dene.disabled = true;
    try {
      await servisKosusuBaslat({ proje, servisId: s.id, ortamId: test.id, taslak: { baslik: baslik.value.trim() || 'Taslak akış senaryosu', icerik }, bitti: () => {} });
    } catch (e) { bildir(e.message, 'hata'); } finally { dene.disabled = false; }
  });

  const akisAdresi = () => (akisId ? `#/servisler/s/${q(s.id)}/akislar/${q(akisId)}` : null);
  yerlestir(kap, h('div', { class: 'kart form-paneli' },
    h('h3', {}, senaryo ? 'Akış senaryosunu düzenle' : 'Yeni akış senaryosu'), mesaj.kutu,
    senaryo && senaryo.servisId !== s.id ? h('p', { class: 'soluk kucuk' }, 'Bu senaryo başka bir serviste kayıtlı; akışı bu servisten geçtiği için burada da listelenir.') : null,
    alan('Başlık', baslik, { zorunlu: true }),
    h('div', { class: 'satir-duzen' },
      alan('Akış', akisSec, { yardim: 'Akış operasyonların sırasını ve adımlar arasında taşınan değerleri tanımlar (Akışlar sekmesi).' }),
      alan('Kapsam', kapsam, { icerik: h('div', {}, kapsam, kapsamNotu) })),
    h('label', { class: 'secenek', for: tumuKutu.id }, tumuKutu, 'Tüm akışları göster (bu servisten geçmeyenler dahil)'),
    h('label', { class: 'secenek', for: dahil.id }, dahil, 'Koşuya dahil'),
    akisId ? h('p', { class: 'kucuk' }, h('a', { href: akisAdresi() }, 'Akışı aç'), h('span', { class: 'soluk' }, ' — sıra ve taşınan değerler orada düzenlenir.')) : null,
    adimKap,
    h('div', { class: 'dugmeler' }, kaydet, dene, h('a', { class: 'dugme hayalet', href: `#/servisler/s/${q(s.id)}` }, 'Vazgeç'))));
  await adimlariYukle();
}
