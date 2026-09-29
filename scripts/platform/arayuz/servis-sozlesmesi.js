// SERVİS SÖZLEŞMESİ sekmesi (servis sayfası > Sözleşme; #/servisler/s/<id>/sozlesme[/<operasyon>]): operasyon (SOAP) / uç (REST)
// başına yanıt sözleşmesi. Kaynaklar: kayıtlı WSDL yanıt şeması ya da yüklenen WSDL / XSD, OpenAPI / Swagger (yerel dosya), JSON Schema
// (yerel dosya ya da yapıştır), "Başarılı yanıttan taslak" (seçilen kayıtlı başarılı yanıtlar). Hiçbiri ağ isteği atmaz; dosyalar
// yalnız okunup sunucuya önizleme için gönderilir. Önizleme / taslak alan alan düzenlenir (tür, zorunlu, null izinli, kaldır) ve
// "Onayla ve kaydet" ile yazılır; var olan sözleşmeyi değiştirmek / silmek ayrıca onay ister (fark gösterilir), geçmişe yazılır.
// Senaryo başına "Yanıt sözleşmeye uymalı" senaryo düzenleyicisindedir (varsayılan kapalı). Kullanıcı verisi DOM'a yalnız metin olarak yazılır.
import { alan, api, bildir, bosDurum, h, ikon, mesajKutusu, mesgulIken, rozet, tarihMetni, yeniKimlik, yerlestir } from './ortak.js';
import { onayIste } from './kosu-paneli.js';
import { SEMA_TIPLERI, TIP_ETIKETLERI, alanKaldir, alanNullAyarla, alanTipiAyarla, alanZorunluAyarla, semaAlanlari } from './sozlesme-dogrulayici.mjs';

const q = encodeURIComponent;
const KAYNAK_ADI = { wsdl: 'WSDL / XSD', openapi: 'OpenAPI / Swagger', jsonSchema: 'JSON Schema', taslak: 'Başarılı yanıttan taslak' };
const ISLEM_ADI = { olustur: 'oluşturuldu', degistir: 'değiştirildi', sil: 'silindi' };
const EN_BUYUK_DOSYA = 15 * 1024 * 1024;

/** Alan yolunun raporla aynı gösterimi: SOAP "/Kok/A/B[]", REST "response.a.b[]". */
function yolGoster(parcalar, bicim, xmlKok) {
  if (bicim === 'xml') return `/${xmlKok || '…'}${parcalar.map((p) => (p === '[]' ? '[]' : `/${p}`)).join('')}`;
  return parcalar.reduce((y, p) => (p === '[]' ? `${y}[]` : `${y}.${p}`), 'response');
}

const tipAdi = (tip) => (tip ? tip.split('|').map((t) => TIP_ETIKETLERI[t] ?? t).join(' | ') : TIP_ETIKETLERI['']);

/** Dosya(lar)ı metin olarak okur (boyut sınırıyla). */
async function dosyaMetinleri(girdi) {
  const dosyalar = [...(girdi.files || [])];
  if (!dosyalar.length) throw new Error('Dosya seçilmedi.');
  for (const f of dosyalar) if (f.size > EN_BUYUK_DOSYA) throw new Error(`"${f.name}" en fazla 15 MB olabilir.`);
  return { metinler: await Promise.all(dosyalar.map((f) => f.text())), ad: dosyalar.map((f) => f.name).join(', ') };
}

/**
 * @param {HTMLElement} kap @param {{ id: string }} proje @param {any} s servis @param {string | null} altKimlik seçili operasyon
 */
export async function sozlesmeSekmesi(kap, proje, s, altKimlik) {
  const rest = s.tur === 'rest';
  const opAdi = rest ? 'Uç' : 'Operasyon';
  const ops = s.ayarlar.operasyonlar || [];
  if (!ops.length) {
    yerlestir(kap, bosDurum(`Bu serviste ${rest ? 'uç' : 'operasyon'} yok.`, rest ? 'İşlemler sekmesinden istek (uç) ekleyin.' : 'İşlemler sekmesinden WSDL\'i alın.', { ikon: 'liste' }));
    return;
  }
  const operasyon = ops.some((o) => o.ad === altKimlik) ? altKimlik : ops[0].ad;
  const adres = `#/servisler/s/${q(s.id)}/sozlesme`;
  const bilgi = await api(`/platform/servis/sozlesme?projeId=${q(proje.id)}&servisId=${q(s.id)}&operasyon=${q(operasyon)}`);
  const sozlesmeler = s.ayarlar.sozlesmeler || {};
  const yenile = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

  // ---- Operasyon seçimi -------------------------------------------------------------------------------------------------------
  const opSec = h('select', { 'aria-label': opAdi },
    ops.map((o) => h('option', { value: o.ad, selected: o.ad === operasyon }, `${o.ad}${o.metot ? ` (${o.metot})` : ''}${sozlesmeler[o.ad] ? ' · sözleşme var' : ''}`)));
  opSec.addEventListener('change', () => { location.hash = `${adres}/${q(opSec.value)}`; });

  // ---- Mevcut sözleşme --------------------------------------------------------------------------------------------------------
  const sz = bilgi.sozlesme;
  const silDugmesi = h('button', { type: 'button', class: 'tehlike' }, ikon('cop'), 'Sözleşmeyi sil');
  silDugmesi.addEventListener('click', async () => {
    try {
      const on = await api('/platform/servis/sozlesme/sil', { govde: { projeId: proje.id, servisId: s.id, operasyon } });
      if (on.onayGerekli && !(await onayIste({
        baslik: `"${operasyon}" sözleşmesi silinsin mi?`, dugme: 'Sil', tehlikeli: true,
        metin: on.senaryoSayisi ? `${on.senaryoSayisi} senaryoda "Yanıt sözleşmeye uymalı" açık; sözleşme silinirse bu senaryolar "Sözleşme: tanımlı değil" ile kalır.` : 'Silme geçmişe yazılır.'
      }))) return;
      await api('/platform/servis/sozlesme/sil', { govde: { projeId: proje.id, servisId: s.id, operasyon, onay: true } });
      bildir('Sözleşme silindi.');
      yenile();
    } catch (e) { bildir(e.message, 'hata'); }
  });
  const gecmis = bilgi.gecmis && bilgi.gecmis.length ? h('details', { class: 'sozlesme-gecmisi' }, h('summary', {}, `Geçmiş (${bilgi.gecmis.length})`),
    h('ul', { class: 'onay-listesi' }, bilgi.gecmis.map((g) => h('li', {},
      h('span', { class: 'mono' }, tarihMetni(g.zaman)), ` — ${ISLEM_ADI[g.islem] ?? g.islem}`, g.kaynak ? ` · ${KAYNAK_ADI[g.kaynak] ?? g.kaynak}` : '',
      g.kaynakBilgisi ? ` (${g.kaynakBilgisi})` : '', typeof g.alanSayisi === 'number' ? ` · ${g.alanSayisi} alan` : '',
      g.fark ? ` · +${g.fark.eklenen} / −${g.fark.kaldirilan} / ~${g.fark.degisen}` : '')))) : null;
  const mevcutKart = h('section', { class: 'kart', 'aria-label': 'Mevcut sözleşme' },
    h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('kalkan'), 'Sözleşme'), sz ? h('span', { class: 'sag' }, silDugmesi) : null),
    sz ? [
      h('p', { class: 'meta sozlesme-meta' }, rozet(KAYNAK_ADI[sz.kaynak] ?? sz.kaynak, 'vurgu'), ' ', sz.kaynakBilgisi ? h('span', {}, sz.kaynakBilgisi) : null,
        h('span', { class: 'soluk' }, ` · ${bilgi.ozet?.alanSayisi ?? 0} alan (${bilgi.ozet?.zorunluSayisi ?? 0} zorunlu) · ${tarihMetni(sz.guncellenme)}`)),
      alanTablosu(sz.sema, sz.bicim, sz.xmlKok, null)
    ] : h('p', { class: 'soluk' }, `"${operasyon}" için sözleşme yok. Aşağıdan bir kaynak seçip önizleyin; onaylayınca kaydedilir.`),
    h('p', { class: 'soluk kucuk' }, bilgi.senaryoSayisi
      ? `${bilgi.senaryoSayisi} senaryoda "Yanıt sözleşmeye uymalı" açık: bu senaryoların yanıtı koşuda sözleşmeye göre doğrulanır.`
      : 'Senaryolarda "Yanıt sözleşmeye uymalı" kapalı (varsayılan): sözleşme koşuyu etkilemez. Açmak için senaryo düzenleyicisindeki kutuyu işaretleyin.'),
    gecmis);

  // ---- Kaynak seçimi ----------------------------------------------------------------------------------------------------------
  const onizlemeKap = h('div', { 'aria-live': 'polite' });
  const mesaj = mesajKutusu();
  const kaynakPanel = h('div', {});
  const kaynaklar = [...(rest ? [] : [['wsdl', 'WSDL / XSD\'den al']]), ['openapi', 'OpenAPI / Swagger yükle'], ['jsonSchema', 'JSON Schema yükle'], ['taslak', 'Başarılı yanıttan taslak']];
  const sekmeler = h('div', { class: 'segment sozlesme-kaynaklari', role: 'tablist', 'aria-label': 'Sözleşme kaynağı' });
  const onizle = async (dugme, govde) => {
    mesaj.temizle();
    try {
      const r = await mesgulIken(dugme, 'Okunuyor…', () => api('/platform/servis/sozlesme/onizle', { govde: { projeId: proje.id, servisId: s.id, operasyon, ...govde } }));
      if (r.taslak) duzenleyici(r.taslak);
      return r;
    } catch (e) { mesaj.goster(e.message); return null; }
  };
  const kaynakCiz = (k) => {
    yerlestir(sekmeler, ...kaynaklar.map(([d, m]) => h('button', { type: 'button', role: 'tab', 'aria-selected': d === k ? 'true' : 'false', onclick: () => kaynakCiz(d) }, m)));
    mesaj.temizle();
    if (k === 'wsdl') {
      const kayitli = h('button', { type: 'button', disabled: !bilgi.wsdlYanitiVar }, ikon('liste'), 'Kayıtlı WSDL şemasından al');
      kayitli.addEventListener('click', () => onizle(kayitli, { kaynak: 'wsdl' }));
      const dosya = h('input', { type: 'file', multiple: true, accept: '.wsdl,.xsd,.xml', id: yeniKimlik('wsdl') });
      const yukle = h('button', { type: 'button' }, ikon('yukle'), 'Dosyadan önizle');
      yukle.addEventListener('click', async () => {
        try { const d = await dosyaMetinleri(dosya); await onizle(yukle, { kaynak: 'wsdl', metinler: d.metinler, dosyaAdi: d.ad }); } catch (e) { mesaj.goster(e.message); }
      });
      yerlestir(kaynakPanel,
        h('p', { class: 'soluk kucuk' }, bilgi.wsdlYanitiVar
          ? 'Servisin kayıtlı WSDL\'indeki yanıt öğesi kullanılır (minOccurs → zorunlu, nillable → null izinli, maxOccurs → dizi).'
          : 'Kayıtlı WSDL\'de bu operasyonun yanıt şeması yok: İşlemler > "WSDL\'den yeniden al" (TEST\'e istek, onayla) ya da WSDL / XSD dosyasını yükleyin.'),
        h('div', { class: 'dugmeler' }, kayitli),
        alan('WSDL / XSD dosyaları (yerel; birden çok seçilebilir)', dosya, { yardim: 'Dosyalar yalnız okunur; içe aktarılan adresler indirilmez. Şema ayrı XSD\'deyse onu da seçin.' }),
        h('div', { class: 'dugmeler' }, yukle));
    } else if (k === 'openapi') {
      const dosya = h('input', { type: 'file', accept: '.json,.yaml,.yml', id: yeniKimlik('openapi') });
      const secimKap = h('div', {});
      let metin = '';
      let dosyaAdi = '';
      const oku = h('button', { type: 'button' }, ikon('yukle'), 'Dosyayı oku');
      oku.addEventListener('click', async () => {
        try {
          const d = await dosyaMetinleri(dosya);
          metin = d.metinler[0]; dosyaAdi = d.ad;
          const r = await onizle(oku, { kaynak: 'openapi', metin, dosyaAdi });
          if (!r || !r.operasyonlar) return;
          const sec = h('select', { 'aria-label': 'OpenAPI operasyonu' }, r.operasyonlar.map((o) => h('option', { value: o.anahtar, selected: o.anahtar === r.oneri, disabled: !o.semaVar },
            `${o.anahtar}${o.operationId ? ` · ${o.operationId}` : ''}${o.durumKodu ? ` → ${o.durumKodu}` : ''}${o.semaVar ? '' : ` (${o.hata})`}`)));
          const al = h('button', { type: 'button', class: 'birincil' }, 'Önizle');
          al.addEventListener('click', () => onizle(al, { kaynak: 'openapi', metin, dosyaAdi, openapiAnahtari: sec.value }));
          yerlestir(secimKap, alan(`Bu ${rest ? 'uca' : 'operasyona'} karşılık gelen OpenAPI operasyonu`, sec,
            { yardim: r.oneri ? 'Metot ve yola göre önerildi; değiştirebilirsiniz.' : 'Eşleşen operasyon bulunamadı; listeden seçin.' }), h('div', { class: 'dugmeler' }, al));
        } catch (e) { mesaj.goster(e.message); }
      });
      yerlestir(kaynakPanel,
        h('p', { class: 'soluk kucuk' }, 'OpenAPI 3 ya da Swagger 2 (JSON / YAML). Yalnız başarılı (2xx) yanıt şeması alınır; belge içi $ref çözülür, dış $ref (başka dosya / adres) indirilmez.'),
        alan('OpenAPI / Swagger dosyası', dosya), h('div', { class: 'dugmeler' }, oku), secimKap);
    } else if (k === 'jsonSchema') {
      const dosya = h('input', { type: 'file', accept: '.json,.yaml,.yml', id: yeniKimlik('sema') });
      const yapistir = h('textarea', { rows: '6', spellcheck: 'false', class: 'kod-alani', placeholder: '{ "type": "object", "required": ["orderId"], "properties": { "orderId": { "type": "integer" } } }' });
      const al = h('button', { type: 'button', class: 'birincil' }, 'Önizle');
      al.addEventListener('click', async () => {
        try {
          const d = dosya.files && dosya.files.length ? await dosyaMetinleri(dosya) : { metinler: [yapistir.value], ad: '' };
          await onizle(al, { kaynak: 'jsonSchema', metin: d.metinler[0], dosyaAdi: d.ad });
        } catch (e) { mesaj.goster(e.message); }
      });
      yerlestir(kaynakPanel,
        h('p', { class: 'soluk kucuk' }, 'Desteklenen: type, required, properties, items, enum, nullable / "null" türü, format (date, date-time, email). Belge içi $ref (#/definitions, #/$defs) çözülür.'),
        alan('JSON Schema dosyası', dosya), alan('ya da yapıştırın', yapistir), h('div', { class: 'dugmeler' }, al));
    } else {
      if (!bilgi.ornekler.length) {
        yerlestir(kaynakPanel, bosDurum('Başarılı yanıt yok.', `Bu ${rest ? 'ucun' : 'operasyonun'} senaryolarını Dene ya da Koşu ile çalıştırın; başarılı yanıtlar burada listelenir.`, { ikon: 'grafik' }));
        return;
      }
      const kutular = bilgi.ornekler.map((o, n) => {
        const c = h('input', { type: 'checkbox', id: yeniKimlik('ornek'), checked: n === 0, value: o.kosuId });
        return { c, el: h('label', { class: 'secenek', for: c.id }, c, `${o.baslik} · ${tarihMetni(o.baslangic)}${o.tur === 'dene' ? ' (deneme)' : ''}`) };
      });
      const al = h('button', { type: 'button', class: 'birincil' }, 'Taslak oluştur');
      al.addEventListener('click', () => onizle(al, { kaynak: 'taslak', kosuIdleri: kutular.filter((x) => x.c.checked).map((x) => x.c.value) }));
      yerlestir(kaynakPanel,
        h('p', { class: 'soluk kucuk' }, 'Seçilen kayıtlı başarılı yanıtlardan tür çıkarılır: zorunlu = tüm örneklerde var, null görüldüyse null izinli. Taslak alan alan düzenlenip onaylanmadan kaydedilmez. Birkaç yanıt seçmek zorunluluğu daha doğru gösterir.'),
        h('fieldset', { class: 'sozlesme-ornekleri' }, h('legend', {}, 'Başarılı yanıtlar'), ...kutular.map((x) => x.el)),
        h('div', { class: 'dugmeler' }, al));
    }
  };

  // ---- Önizleme / taslak düzenleyici ------------------------------------------------------------------------------------------
  function duzenleyici(t) {
    const sema = JSON.parse(JSON.stringify(t.sema));
    const tabloKap = h('div', {});
    const ciz = () => yerlestir(tabloKap, alanTablosu(sema, t.bicim, t.xmlKok, { degisti: ciz }));
    const kaydet = h('button', { type: 'button', class: 'birincil' }, ikon('onay'), 'Onayla ve kaydet');
    const vazgec = h('button', { type: 'button', class: 'hayalet' }, 'Vazgeç');
    vazgec.addEventListener('click', () => yerlestir(onizlemeKap));
    const kayitMesaji = mesajKutusu();
    kaydet.addEventListener('click', async () => {
      kayitMesaji.temizle();
      const govde = { projeId: proje.id, servisId: s.id, operasyon, sozlesme: { kaynak: t.kaynak, sema, xmlKok: t.xmlKok, kaynakBilgisi: t.kaynakBilgisi, ...(t.istek ? { istek: t.istek } : {}) } };
      try {
        const r = await mesgulIken(kaydet, 'Kaydediliyor…', () => api('/platform/servis/sozlesme/kaydet', { govde }));
        if (r.onayGerekli) {
          const f = r.fark || {};
          const liste = [...(f.eklenen || []).map((x) => `Eklenen: ${x || '(kök)'}`), ...(f.kaldirilan || []).map((x) => `Kaldırılan: ${x || '(kök)'}`), ...(f.degisen || []).map((x) => `Değişen: ${x || '(kök)'}`)];
          if (!(await onayIste({ baslik: `"${operasyon}" sözleşmesi değiştirilsin mi?`, dugme: 'Değiştir', ikonAd: 'kalkan',
            metin: liste.length ? 'Mevcut sözleşme yenisiyle değişir; değişiklik geçmişe yazılır.' : 'Alanlar aynı; kaynak bilgisi güncellenir. Değişiklik geçmişe yazılır.', liste }))) return;
          await api('/platform/servis/sozlesme/kaydet', { govde: { ...govde, onay: true } });
        }
        bildir('Sözleşme kaydedildi.');
        yenile();
      } catch (e) { kayitMesaji.goster(e.message); }
    });
    ciz();
    yerlestir(onizlemeKap, h('section', { class: 'kart sozlesme-onizleme', 'aria-label': t.kaynak === 'taslak' ? 'Sözleşme taslağı' : 'Sözleşme önizlemesi' },
      h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('duzenle'), t.kaynak === 'taslak' ? 'Taslak' : 'Önizleme'),
        h('span', { class: 'sag' }, rozet(t.kaynak === 'taslak' ? 'TASLAK' : KAYNAK_ADI[t.kaynak] ?? t.kaynak, t.kaynak === 'taslak' ? 'durdu' : 'vurgu'))),
      h('p', { class: 'soluk kucuk' }, `${t.kaynakBilgisi || ''}${t.kaynakBilgisi ? ' · ' : ''}${t.ozet.alanSayisi} alan. Türü, zorunluluğu ve null iznini alan alan düzenleyin; gereksiz alanı kaldırın. Onaylanana kadar hiçbir şey kaydedilmez.`),
      t.uyarilar && t.uyarilar.length ? h('div', { class: 'not-kutusu uyari', role: 'note' }, h('ul', {}, t.uyarilar.map((u) => h('li', {}, u)))) : null,
      kayitMesaji.kutu, tabloKap, h('div', { class: 'dugmeler' }, kaydet, vazgec)));
    onizlemeKap.querySelector('h3')?.scrollIntoView?.({ block: 'nearest' });
  }

  kaynakCiz(rest ? 'openapi' : 'wsdl');
  yerlestir(kap,
    h('section', { class: 'kart form-paneli', 'aria-label': `${opAdi} seçimi` }, alan(opAdi, opSec, { yardim: 'Sözleşme her operasyon / uç için ayrıdır.' })),
    mevcutKart,
    h('section', { class: 'kart form-paneli', 'aria-label': 'Sözleşme kaynağı' }, h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('yukle'), sz ? 'Sözleşmeyi değiştir' : 'Sözleşme oluştur')),
      sekmeler, mesaj.kutu, kaynakPanel),
    onizlemeKap);
}

/**
 * Alan tablosu. duzenle verilirse tür / zorunlu / null izinli / kaldır düzenlenir (şema yerinde değişir, sonra duzenle.degisti()).
 * @param {any} sema @param {'json' | 'xml'} bicim @param {string | undefined} xmlKok @param {{ degisti: () => void } | null} duzenle
 */
function alanTablosu(sema, bicim, xmlKok, duzenle) {
  const satirlar = semaAlanlari(sema);
  const govde = satirlar.map((a) => {
    const yol = yolGoster(a.parcalar, bicim, xmlKok);
    const kok = !a.parcalar.length;
    const oge = a.parcalar.at(-1) === '[]';
    const girinti = { style: `padding-inline-start: ${Math.min(a.parcalar.length, 8) * 0.9}rem` };
    if (!duzenle) {
      return h('tr', {}, h('td', {}, h('code', { class: 'duz', ...girinti }, kok ? `${yol} (kök)` : yol)), h('td', {}, tipAdi(a.tip), a.format ? h('span', { class: 'soluk' }, ` · ${a.format}`) : null,
        a.enum ? h('span', { class: 'soluk' }, ` · ${a.enum.length} değer`) : null),
      h('td', {}, kok || oge ? '—' : a.zorunlu ? 'evet' : 'hayır'), h('td', {}, a.nullIzinli ? 'evet' : 'hayır'));
    }
    const secenekler = [...SEMA_TIPLERI, ''];
    if (a.tip && !secenekler.includes(a.tip)) secenekler.push(a.tip);
    const tip = h('select', { 'aria-label': `${yol} türü` }, secenekler.map((t) => h('option', { value: t, selected: t === a.tip }, tipAdi(t))));
    tip.addEventListener('change', () => { alanTipiAyarla(sema, a.parcalar, tip.value); duzenle.degisti(); });
    const zorunlu = h('input', { type: 'checkbox', checked: a.zorunlu, disabled: kok || oge, 'aria-label': `${yol} zorunlu` });
    zorunlu.addEventListener('change', () => { alanZorunluAyarla(sema, a.parcalar, zorunlu.checked); duzenle.degisti(); });
    const nul = h('input', { type: 'checkbox', checked: a.nullIzinli, 'aria-label': `${yol} null izinli` });
    nul.addEventListener('change', () => { alanNullAyarla(sema, a.parcalar, nul.checked); duzenle.degisti(); });
    const kaldir = kok || oge ? null : h('button', { type: 'button', class: 'kucuk-dugme hayalet', 'aria-label': `${yol} alanını kaldır`, title: 'Alanı kaldır' }, ikon('cop'));
    kaldir?.addEventListener('click', () => { alanKaldir(sema, a.parcalar); duzenle.degisti(); });
    return h('tr', {}, h('td', {}, h('code', { class: 'duz', ...girinti }, kok ? `${yol} (kök)` : yol)), h('td', {}, tip), h('td', {}, zorunlu), h('td', {}, nul), h('td', {}, kaldir));
  });
  return h('div', { class: 'tablo-kaydirma' }, h('table', { class: 'ozet-tablosu sozlesme-alanlari', 'aria-label': duzenle ? 'Sözleşme alanları (düzenlenebilir)' : 'Sözleşme alanları' },
    h('thead', {}, h('tr', {}, ['Alan', 'Tür', 'Zorunlu', 'Null izinli', ...(duzenle ? [''] : [])].map((x) => h('th', {}, x)))),
    h('tbody', {}, govde)));
}
