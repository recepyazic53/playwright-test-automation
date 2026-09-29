// Yedek içe aktarma akışı: dosya + parola → yükleme (ilerleme) → ÖNİZLEME (Yeni / Değişen /
// Yalnızca bu bilgisayarda) → seçim → uygulama → özet. Önizlemenin başında "Hedef proje": yedekteki her proje yeni proje
// olarak ya da mevcut bir projeye (ortamları o projenin ortamlarına eşlenerek) aktarılır; seçim değişince önizleme yenilenir. Hoş geldiniz ekranında (boş veritabanı:
// yedeğin parolası bu bilgisayarın kasa parolası olur) ve Ayarlar > Yedekleme'de kullanılır.
import {
  ApiHatasi, TOKEN, alan, alanHatasi, api, bosDurum, boyutMetni, dosyaSecimi, geriSayim, h, ikon, mesajKutusu, parolaAlani, rozet, tarihMetni, yeniKimlik
} from './ortak.js';

const ADIMLAR = [['dosya', 'Dosya ve parola'], ['hazirlik', 'Hazırlık'], ['onizleme', 'Önizleme ve seçim'], ['ozet', 'Özet']];
function adimListesi(aktif) {
  const sira = ADIMLAR.findIndex(([a]) => a === aktif);
  return h('ol', { class: 'adimlar', 'aria-label': 'İçe aktarma adımları' },
    ADIMLAR.map(([a, etiket], i) => h('li', { class: i < sira ? 'tamam' : '', 'aria-current': a === aktif ? 'step' : null },
      etiket, i < sira ? h('span', { class: 'gorunmez' }, ' (tamamlandı)') : null)));
}

const ALAN_ETIKETLERI = {
  ad: 'Ad', aciklama: 'Açıklama', ayarlar_json: 'Ayarlar', taban_url: 'Adres', varsayilan: 'Varsayılan',
  proje_id: 'Proje', ortam_id: 'Ortam', kullanici_adi: 'Kullanıcı adı', parola: 'Parola',
  iki_asamali_tur: 'İki aşamalı doğrulama', totp_gizli: 'Authenticator gizli anahtarı', sms_ayari_json: 'SMS ayarı',
  tur: 'Tür', alanlar_json: 'Alanlar', tur_id: 'Test verisi türü', degerler_json: 'Değerler', anahtar: 'Anahtar',
  ekran_id: 'Ekran', surum: 'Sürüm', model_json: 'Model', baslik: 'Başlık', icerik_json: 'İçerik',
  kosuya_dahil: 'Koşuya dahil', deger_json: 'Değer'
};
const EKLEME_ETIKETLERI = {
  kosular: 'Koşular', kosu_sonuclari: 'Koşu sonuçları', degisiklik_gecmisi: 'Değişiklik geçmişi kayıtları', makineler: 'Bilgisayar kayıtları',
  adim_sonuclari: 'Adım sonuçları', medya: 'Medya kayıtları'
};
const MEDYA_TUR_ETIKETLERI = { ekran_goruntusu: 'Ekran görüntüleri', video: 'Videolar', iz: 'İz (trace) dosyaları', diger: 'Diğer ekler' };

/** Önizlemedeki medya bölümü: tür başına eklenecek dosya sayısı/boyutu. */
function medyaBolumu(medya) {
  if (!medya) return null;
  const turler = Object.entries(medya.turler || {}).filter(([, t]) => t.dosyada > 0);
  if (!turler.length) return null;
  const satirlar = turler.map(([tur, t]) => h('tr', {},
    h('th', { scope: 'row' }, MEDYA_TUR_ETIKETLERI[tur] || tur),
    h('td', {}, String(t.eklenecek)),
    h('td', {}, t.eklenecek ? boyutMetni(t.eklenecekBayt) : '—'),
    h('td', {}, String(t.zatenVar)),
    h('td', {}, String(t.dahilDegil))));
  return h('section', { class: 'grup', 'aria-label': 'Medya dosyaları' },
    h('h4', {}, ikon('ekran'), 'Medya dosyaları'),
    medya.bicimSurumu < 2
      ? h('p', { class: 'soluk kucuk' }, 'Bu yedek eski biçimde: medya dosyası içermez. Sonuçlarda medya "yedeğe dahil edilmemişti" olarak görünür.')
      : h('p', { class: 'soluk kucuk' }, 'Uygulanan sonuçların medya dosyaları eklenir; seçmediğiniz projelerin sonuçlarındaki medya atlanır.'),
    h('div', { class: 'tablo-kaydirma' }, h('table', { class: 'ozet-tablosu' },
      h('caption', { class: 'gorunmez' }, 'Medya türüne göre eklenecek dosyalar'),
      h('thead', {}, h('tr', {}, ...['Tür', 'Eklenecek', 'Boyut', 'Bu bilgisayarda zaten var', 'Yedeğe dahil değil'].map((b) => h('th', { scope: 'col' }, b)))),
      h('tbody', {}, satirlar))),
    medya.toplam.eklenecek ? h('p', { class: 'kucuk' }, `Toplam: ${medya.toplam.eklenecek} medya dosyası, ${boyutMetni(medya.toplam.eklenecekBayt)}.`) : null);
}
const GIZLI_ALANLAR = new Set(['id', 'olusturulma', 'guncellenme']);
const MASKE = '••••••';

const alanEtiketi = (ad) => {
  const [sutun, ic] = String(ad).split(/\.(.+)/);
  const ana = ALAN_ETIKETLERI[sutun] || sutun;
  return ic ? `${ana} › ${ic}` : ana;
};
const degerMetni = (d) => {
  if (d === null || d === undefined || d === '') return '—';
  if (typeof d === 'object') return JSON.stringify(d);
  return String(d);
};

/**
 * @param {HTMLElement} kapsayici
 * @param {{ mod: 'hosgeldin' | 'ayarlar'; bitti: () => void; vazgec: () => void }} secenekler
 */
export function iceAktarmaAkisi(kapsayici, secenekler) {
  let isId = null;
  let durdurGeriSayim = () => {};
  const goster = (adim, ...icerik) => {
    kapsayici.replaceChildren(adimListesi(adim), ...icerik);
    const baslik = kapsayici.querySelector('h2');
    if (baslik) { baslik.tabIndex = -1; baslik.focus(); }
  };
  const iptalEt = async () => {
    durdurGeriSayim();
    if (isId) {
      try { await api(`/platform/yedek/ice-aktar/${isId}/iptal`, { govde: {} }); } catch { /* süresi dolmuş olabilir */ }
    }
    isId = null;
    secenekler.vazgec();
  };

  // --- 1) Dosya + parola ------------------------------------------------------------
  function dosyaFormu(onMesaj) {
    const dosyaGirdisi = h('input', { type: 'file', accept: '.tayedek', name: 'yedek', required: true });
    // Her seçimden sonra girdi sıfırlanır (aynı adlı dosya yeniden seçilince yeniden alınır); seçilen dosya saklanır.
    const dosyaSecimiDurumu = dosyaSecimi(dosyaGirdisi);
    const parola = parolaAlani('Yedeğin parolası', {
      zorunlu: true, otomatik: 'current-password',
      yardim: secenekler.mod === 'hosgeldin'
        ? 'Yedeği oluşturan bilgisayardaki kasa parolası. Bu bilgisayarda da kasa parolası olarak kullanılacak.'
        : 'Yedeği oluşturan kasanın parolası (bu bilgisayarın parolasından farklı olabilir).'
    });
    const mesaj = mesajKutusu();
    const gonder = h('button', { type: 'submit', class: 'birincil' }, 'Yükle ve önizle');
    const form = h('form', { class: 'kart', novalidate: true },
      h('h2', {}, ikon('yukle'), 'Yedek yükle'),
      h('p', { class: 'soluk' }, 'Bir .tayedek dosyası seçin. Uygulamadan önce neyin ekleneceğini ve neyin değişeceğini göreceksiniz; bu bilgisayardaki hiçbir kayıt silinmez.'),
      mesaj.kutu,
      alan('Yedek dosyası', dosyaGirdisi, { zorunlu: true, icerik: h('div', {}, dosyaGirdisi, dosyaSecimiDurumu.not), yardim: 'Yalnızca bu platformun ürettiği .tayedek dosyaları.' }),
      parola.kapsayici,
      h('div', { class: 'dugmeler' }, gonder, h('button', { type: 'button', class: 'hayalet', onclick: iptalEt }, 'Vazgeç')));
    if (onMesaj) mesaj.goster(onMesaj.metin, onMesaj.tur);
    form.addEventListener('submit', (olay) => {
      olay.preventDefault();
      alanHatasi(dosyaGirdisi, '');
      alanHatasi(parola.girdi, '');
      const [dosya] = dosyaSecimiDurumu.dosyalar();
      let hata = false;
      if (!dosya) { alanHatasi(dosyaGirdisi, 'Bir yedek dosyası seçin.'); hata = true; }
      else if (!dosya.name.toLowerCase().endsWith('.tayedek')) { alanHatasi(dosyaGirdisi, 'Dosya uzantısı .tayedek olmalıdır.'); hata = true; }
      if (!parola.girdi.value) { alanHatasi(parola.girdi, 'Yedeğin parolasını girin.'); hata = true; }
      if (hata) { form.querySelector('[aria-invalid="true"]')?.focus(); return; }
      yukle(dosya, parola.girdi.value);
    });
    goster('dosya', form);
  }

  // --- 2) Yükleme + hazırlık ilerlemesi -----------------------------------------------
  function ilerlemeEkrani() {
    const cubuk = h('progress', { max: '100', value: '0', 'aria-labelledby': 'ilerleme-metni' });
    const metin = h('p', { id: 'ilerleme-metni', class: 'secim-sayaci', 'aria-live': 'polite' }, 'Dosya yükleniyor… %0');
    const yuzdeEl = h('span', { class: 'yuzde', 'aria-hidden': 'true' }, '%0');
    goster('hazirlik', h('div', { class: 'kart' }, h('h2', {}, ikon('arsiv'), 'Yedek hazırlanıyor'),
      h('p', { class: 'soluk' }, 'Dosya yükleniyor, açılıyor ve bu bilgisayardaki kayıtlarla karşılaştırılıyor.'),
      h('div', { class: 'ilerleme' }, h('div', { class: 'ilerleme-ust' }, h('span', { class: 'donen', 'aria-hidden': 'true' }), metin, yuzdeEl), cubuk),
      h('div', { class: 'dugmeler' }, h('button', { type: 'button', class: 'hayalet', onclick: iptalEt }, 'İptal'))));
    return (asama, yuzde) => {
      cubuk.value = yuzde;
      metin.textContent = `${asama} %${Math.round(yuzde)}`;
      yuzdeEl.textContent = `%${Math.round(yuzde)}`;
    };
  }

  function beklemeMesaji(saniye, temel) {
    durdurGeriSayim();
    const kutu = { metin: '', tur: 'hata' };
    dosyaFormu(kutu);
    const alanKutusu = kapsayici.querySelector('[role="alert"]');
    const gonder = kapsayici.querySelector('button[type="submit"]');
    durdurGeriSayim = geriSayim(saniye, (kalan) => {
      if (!alanKutusu) return;
      alanKutusu.hidden = false;
      alanKutusu.className = 'not-kutusu hata';
      alanKutusu.textContent = kalan > 0 ? `${temel} ${kalan} saniye sonra tekrar deneyebilirsiniz.` : `${temel} Şimdi tekrar deneyebilirsiniz.`;
      if (gonder) gonder.disabled = kalan > 0;
    });
  }

  function yukle(dosya, parola) {
    const ilerle = ilerlemeEkrani();
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/platform/yedek/ice-aktar');
    xhr.setRequestHeader('X-Test-Sunucu-Token', TOKEN);
    xhr.setRequestHeader('X-Kasa-Parola', encodeURIComponent(parola));
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.upload.onprogress = (o) => { if (o.lengthComputable) ilerle('Dosya yükleniyor…', (o.loaded / o.total) * 100); };
    xhr.onerror = () => dosyaFormu({ metin: 'Dosya yüklenemedi: sunucuya ulaşılamadı.', tur: 'hata' });
    xhr.onload = () => {
      let veri = {};
      try { veri = JSON.parse(xhr.responseText); } catch { veri = {}; }
      if (xhr.status === 202 && veri.isId) {
        isId = veri.isId;
        ilerle('Yedek açılıyor…', 0);
        izle(ilerle);
        return;
      }
      if (xhr.status === 429 && veri.bekleSaniye) { beklemeMesaji(veri.bekleSaniye, 'Art arda yanlış parola girildi.'); return; }
      dosyaFormu({ metin: veri.mesaj || `Yükleme başarısız (${xhr.status}).`, tur: 'hata' });
    };
    xhr.send(dosya);
  }

  async function izle(ilerle) {
    for (;;) {
      await new Promise((coz) => setTimeout(coz, 350));
      if (!isId) return;
      let is;
      try {
        is = (await api(`/platform/yedek/ice-aktar/${isId}`)).is;
      } catch (hata) {
        const is2 = hata instanceof ApiHatasi && hata.govde && hata.govde.is;
        isId = null;
        if (is2 && is2.kod === 'PAROLA_YANLIS') {
          const durum = await api('/platform/durum').catch(() => ({ parolaBeklemeSaniye: 0 }));
          if (durum.parolaBeklemeSaniye > 0) { beklemeMesaji(durum.parolaBeklemeSaniye, is2.mesaj); return; }
        }
        dosyaFormu({ metin: (is2 && is2.mesaj) || hata.message, tur: 'hata' });
        return;
      }
      if (is.durum === 'hazirlaniyor') { ilerle(is.asama, is.yuzde); continue; }
      if (is.durum === 'hazir' && is.onizleme) { await onizlemeHazir(is.onizleme); return; }
      isId = null;
      dosyaFormu({ metin: is.mesaj || 'İçe aktarma hazırlanamadı.', tur: 'hata' });
      return;
    }
  }

  // --- 3a) Hedef proje / ortam eşlemesi ---------------------------------------------------
  // Öneri kimlik dışı bir eşleme içeriyorsa (ör. aynı projenin farklı kimlikli aynı adlı ortamı) önizleme baştan eşlemeyle gelir.
  async function onizlemeHazir(onizleme) {
    const pe = onizleme.projeEslemesi;
    const kimlikDisi = pe && !pe.uygulanan && Object.entries(pe.oneri.projeler).some(([p, e]) => (e.hedef !== 'yeni' && e.hedef !== p)
      || Object.entries(e.ortamlar || {}).some(([k, v]) => v !== 'yeni' && v !== k));
    if (kimlikDisi) {
      try { onizleme = (await api(`/platform/yedek/ice-aktar/${isId}/esleme`, { govde: { esleme: pe.oneri } })).onizleme; } catch { /* eşlemesiz önizleme */ }
    }
    onizlemeEkrani(onizleme);
  }

  const TUR_ETIKETI = { test: 'Test', canli: 'Canlı' };
  /** Kalıntı sayıları { tablo: sayı } → okunur metin ("3 servis, 6 servis senaryosu"). */
  const KALINTI_ETIKETLERI = {
    projeler: 'proje kaydı', ortamlar: 'ortam', giris_profilleri: 'giriş profili', baglam_profilleri: 'bağlam profili',
    test_verisi_turleri: 'test verisi tablosu', test_verisi_profilleri: 'test verisi satırı', ekranlar: 'ekran', senaryolar: 'senaryo',
    servisler: 'servis', servis_senaryolari: 'servis senaryosu', servis_kimlikleri: 'servis giriş bilgisi',
    servis_parametre_tanimlari: 'servis parametre tanımı', servis_akislari: 'servis akışı', kosular: 'koşu', servis_kosulari: 'servis koşusu',
    servis_akis_kosulari: 'servis akışı koşusu', ekipler: 'ekip', rapor_isaretleri: 'rapor işareti', kurtarma_kurallari: 'kurtarma kuralı'
  };
  const kalintiMetni = (k) => Object.entries(k).map(([t, n]) => `${n} ${KALINTI_ETIKETLERI[t] || t}`).join(', ');
  const ortamEtiketi = (o) => (o.tur ? `${o.ad} (${TUR_ETIKETI[o.tur]})` : o.ad);

  /** Yedekteki her proje için hedef seçimi ve (mevcut projeye aktarılırken) ortam eşlemesi; değişince önizleme yenilenir. */
  function eslemeBolumu(onizleme) {
    const pe = onizleme.projeEslemesi;
    if (!pe || !pe.yedekProjeleri.length || !pe.yerelProjeler.length) return null;
    // Geçerli eşleme: uygulanmış olan, yoksa öneri (öneri kimlik eşlemesidir: bugünkü davranış).
    const esleme = JSON.parse(JSON.stringify(pe.uygulanan || pe.oneri));
    const yerel = new Map(pe.yerelProjeler.map((p) => [p.id, p]));
    const mesaj = mesajKutusu();
    const secimler = [];
    const yenile = async (degisen) => {
      mesaj.temizle();
      for (const s of secimler) s.disabled = true;
      try {
        const { onizleme: yeni } = await api(`/platform/yedek/ice-aktar/${isId}/esleme`, { govde: { esleme } });
        onizlemeEkrani(yeni, degisen);
      } catch (hata) {
        for (const s of secimler) s.disabled = false;
        mesaj.goster(hata.message);
      }
    };
    const projeler = pe.yedekProjeleri.map((kp) => {
      const e = esleme.projeler[kp.id] || (esleme.projeler[kp.id] = { hedef: 'yeni' });
      const hedefSecimi = h('select', { 'data-yedek-proje': kp.id },
        h('option', { value: 'yeni', selected: e.hedef === 'yeni' }, kp.yerelde ? 'Yeni proje olarak ekle (yeni kimlikle)' : 'Yeni proje olarak ekle (yedekteki adıyla)'),
        pe.yerelProjeler.map((p) => h('option', { value: p.id, selected: e.hedef === p.id },
          `Mevcut projeye aktar: ${p.ad}${p.id === kp.onerilenMevcut ? ' (önerilen)' : ''}`)));
      secimler.push(hedefSecimi);
      hedefSecimi.addEventListener('change', () => {
        esleme.projeler[kp.id] = hedefSecimi.value === 'yeni' ? { hedef: 'yeni' } : { hedef: hedefSecimi.value }; // ortamlar: sunucu önerir
        yenile(`[data-yedek-proje="${kp.id}"]`);
      });
      const hedefProje = e.hedef === 'yeni' ? null : yerel.get(e.hedef);
      const ipucu = !hedefProje && !kp.yerelde && kp.onerilenMevcut && yerel.get(kp.onerilenMevcut)
        ? h('p', { class: 'not-kutusu bilgi kucuk' }, `Bu bilgisayarda "${yerel.get(kp.onerilenMevcut).ad}" projesi var. Yedekteki kayıtları o projede görmek için "Mevcut projeye aktar"ı seçin; yoksa "${kp.ad}" ayrı bir proje olarak eklenir.`)
        : null;
      let ortamlar = null;
      if (hedefProje && kp.ortamlar.length) {
        ortamlar = h('div', { class: 'esleme-ortamlari' },
          h('h5', {}, `Ortam eşlemesi (${kp.ad} → ${hedefProje.ad})`),
          h('p', { class: 'soluk kucuk' }, 'Yedekteki ortamlara başvuran her şey (servis adresleri, tablo satırları, senaryo ortamları, giriş profilleri, planlı koşular…) seçtiğiniz ortama yazılır. Eşlenen ortamın bu bilgisayardaki adresi ve ayarları değişmez.'),
          h('ul', { class: 'esleme-listesi' }, kp.ortamlar.map((ko) => {
            const secim = h('select', { 'data-yedek-ortam': ko.id },
              hedefProje.ortamlar.map((yo) => h('option', { value: yo.id, selected: (e.ortamlar || {})[ko.id] === yo.id }, `→ ${ortamEtiketi(yo)}`)),
              h('option', { value: 'yeni', selected: !(e.ortamlar || {})[ko.id] || e.ortamlar[ko.id] === 'yeni' }, '→ Yeni ortam olarak ekle'));
            secimler.push(secim);
            secim.addEventListener('change', () => {
              e.ortamlar = { ...(e.ortamlar || {}), [ko.id]: secim.value };
              yenile(`[data-yedek-ortam="${ko.id}"]`);
            });
            return h('li', { class: 'esleme-satiri' }, alan(`${ortamEtiketi(ko)} (yedekte)`, secim));
          })));
      }
      const ozet = (pe.ozet || []).find((o) => o.kaynak.id === kp.id);
      return h('div', { class: 'esleme-projesi', 'data-yedek-proje-kutusu': kp.id },
        alan(`Yedekteki proje: ${kp.ad}`, hedefSecimi, { yardim: 'Kayıtlarının yazılacağı proje.' }),
        ipucu, ortamlar,
        ozet ? h('p', { class: 'esleme-ozeti' }, ozet.metin) : null,
        ozet && ozet.kalinti ? h('p', { class: 'not-kutusu uyari kucuk esleme-kalintisi', role: 'note' },
          `Bu bilgisayarda silinmiş "${kp.ad}" projesinden kalan kayıtlar var (${kalintiMetni(ozet.kalinti)}). Yedekte karşılığı olanlar seçilirse "${ozet.hedef.ad}" projesine taşınır; ikinci kopya oluşmaz.`) : null);
    });
    return h('section', { class: 'grup esleme-bolumu', 'aria-label': 'Hedef proje' },
      h('h3', {}, ikon('klasor'), 'Hedef proje'),
      h('p', { class: 'soluk kucuk' }, 'Yedekteki kayıtların bu bilgisayarda hangi projeye yazılacağını seçin. Seçim değişince önizleme yenilenir; onaylamadan hiçbir şey yazılmaz.'),
      mesaj.kutu, projeler);
  }

  // --- 3) Önizleme ve seçim ------------------------------------------------------------
  // Her varlık türü ve içindeki her grup (Yeni / Değişen / Yalnızca bu bilgisayarda) açılır-kapanır ve varsayılan kapalıdır:
  // başlıkta sayılar ve üç durumlu (tümü / hiçbiri / kısmi) seçim kutusu. Seçim kayıt kimliğiyle tutulur; satırlar grup ilk
  // açıldığında çizilir (SAYFA_BOYU kadar, kalanı "Daha fazla göster" ile).
  const SAYFA_BOYU = 200;
  const GRUP_TANIMLARI = [
    { anahtar: 'yeni', sinif: 'yeni', ad: 'Yeni', kisa: 'yeni', ikon: 'artiYalin', secilebilir: true },
    { anahtar: 'degisen', sinif: 'degisen', ad: 'Değişen', kisa: 'değişen', ikon: 'duzenle', secilebilir: true,
      not: 'Seçilirse yedekteki sürüm bu bilgisayardakinin yerine geçer; bu bilgisayardaki sürüm değişiklik geçmişinde saklanır.' },
    { anahtar: 'yalnizBurada', sinif: 'yalniz-burada', ad: 'Yalnızca bu bilgisayarda', kisa: 'yalnızca bu bilgisayarda', ikon: 'bilgisayar', secilebilir: false,
      not: 'Bilgi amaçlıdır: içe aktarma bu kayıtları silmez veya değiştirmez.' }
  ];

  function onizlemeEkrani(onizleme, odak) {
    /** @type {Map<string, Set<string>>} */
    const secilen = new Map();
    let secilebilirSayisi = 0;
    /** Çizilmiş satır kutuları (gruplar açıldıkça eklenir). @type {Array<{ tablo: string; id: string; kutu: HTMLInputElement }>} */
    const cizilenKutular = [];
    /** @type {Array<{ tablo: string; id: string }>} */
    const tumOgeler = [];
    const guncelleyiciler = [];
    const secimSayaci = h('p', { 'aria-live': 'polite', class: 'secim-sayaci' });
    const seciliMi = (tablo, id) => Boolean(secilen.get(tablo)?.has(id));
    const secimAyarla = (tablo, id, secili) => {
      if (!secilen.has(tablo)) secilen.set(tablo, new Set());
      if (secili) secilen.get(tablo).add(id); else secilen.get(tablo).delete(id);
    };
    const secimiGuncelle = () => {
      let toplam = 0;
      for (const s of secilen.values()) toplam += s.size;
      secimSayaci.textContent = `Seçili: ${toplam} / ${secilebilirSayisi} kayıt`;
      for (const k of cizilenKutular) k.kutu.checked = seciliMi(k.tablo, k.id);
      for (const g of guncelleyiciler) g();
    };
    const seciliSay = (ogeler) => ogeler.reduce((n, o) => n + (seciliMi(o.tablo, o.id) ? 1 : 0), 0);

    /** Grup / tür başlığındaki üç durumlu kutu: tümü seçiliyse işaretli, hiçbiri değilse boş, arada "kısmi" (indeterminate + aria-checked="mixed"). */
    const ucDurumluKutu = (etiket, ogeler) => {
      const kutu = h('input', { type: 'checkbox', class: 'uc-durumlu', 'aria-label': etiket });
      guncelleyiciler.push(() => {
        const n = seciliSay(ogeler);
        kutu.checked = n > 0 && n === ogeler.length;
        kutu.indeterminate = n > 0 && n < ogeler.length;
        if (kutu.indeterminate) kutu.setAttribute('aria-checked', 'mixed'); else kutu.removeAttribute('aria-checked');
      });
      kutu.addEventListener('change', () => {
        for (const o of ogeler) secimAyarla(o.tablo, o.id, kutu.checked);
        secimiGuncelle();
      });
      return kutu;
    };

    /** Açılır-kapanır bölüm: başlıkta (isteğe bağlı) seçim kutusu + aria-expanded düğmesi; içerik ilk açılışta çizilir. */
    const acilir = (baslikEtiketi, kutu, dugmeIcerigi, icerikCiz) => {
      const govde = h('div', { class: 'acilir-govde', id: yeniKimlik('acilir'), hidden: true });
      const dugme = h('button', { type: 'button', class: 'acilir-dugme', 'aria-expanded': 'false', 'aria-controls': govde.id },
        h('span', { class: 'acilir-ok', 'aria-hidden': 'true' }), ...dugmeIcerigi);
      let cizildi = false;
      dugme.addEventListener('click', () => {
        const ac = dugme.getAttribute('aria-expanded') !== 'true';
        if (ac && !cizildi) { govde.append(...icerikCiz()); cizildi = true; secimiGuncelle(); }
        dugme.setAttribute('aria-expanded', String(ac));
        govde.hidden = !ac;
      });
      return { baslik: h('div', { class: 'acilir-baslik' }, kutu, h(baslikEtiketi, {}, dugme)), govde };
    };

    const ogeKutusu = (tablo, oge, grupAdi) => {
      const kutu = h('input', { type: 'checkbox', checked: seciliMi(tablo, oge.id), id: yeniKimlik('sec') });
      kutu.addEventListener('change', () => { secimAyarla(tablo, oge.id, kutu.checked); secimiGuncelle(); });
      cizilenKutular.push({ tablo, id: oge.id, kutu });
      return h('label', { class: 'secenek', for: kutu.id }, kutu,
        h('span', {}, oge.baslik, h('span', { class: 'gorunmez' }, ` (${grupAdi})`)));
    };

    const farkTablosu = (oge) => {
      const farkliSutunlar = new Set(oge.farklar.map((f) => String(f.alan).split('.')[0]));
      const satirlar = [];
      const sutunlar = [...new Set([...Object.keys(oge.yerel || {}), ...Object.keys(oge.dosya || {})])].filter((s) => !GIZLI_ALANLAR.has(s));
      for (const sutun of sutunlar) {
        const icFarklar = oge.farklar.filter((f) => String(f.alan).startsWith(`${sutun}.`));
        const dogrudan = oge.farklar.find((f) => f.alan === sutun);
        if (icFarklar.length) {
          for (const f of icFarklar) satirlar.push(farkSatiri(f.alan, f.yerel, f.dosya, true, f.maskeli));
        } else if (dogrudan) {
          satirlar.push(farkSatiri(sutun, dogrudan.yerel, dogrudan.dosya, true, dogrudan.maskeli));
        } else if (!farkliSutunlar.has(sutun) && !sutun.endsWith('_id')) {
          satirlar.push(farkSatiri(sutun, oge.yerel[sutun], oge.dosya[sutun], false, false));
        }
      }
      return h('div', { class: 'tablo-kaydirma' },
        h('table', { class: 'fark-tablosu' },
          h('caption', { class: 'gorunmez' }, `${oge.baslik}: alan bazında karşılaştırma`),
          h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Alan'), h('th', { scope: 'col' }, 'Bu bilgisayarda'), h('th', { scope: 'col' }, 'Yedek dosyasında'))),
          h('tbody', {}, satirlar)));
    };
    const farkSatiri = (ad, yerel, dosya, degisti, maskeli) => h('tr', { class: degisti ? 'degisti' : 'ayni' },
      h('th', { scope: 'row' }, alanEtiketi(ad), degisti ? h('span', { class: 'fark-isareti' }, 'değişti') : null),
      h('td', {}, degerMetni(yerel), maskeli && degerMetni(yerel) === MASKE ? h('span', { class: 'soluk' }, ' (gizli)') : null),
      h('td', {}, degerMetni(dosya), maskeli && degerMetni(dosya) === MASKE ? h('span', { class: 'soluk' }, ' (gizli)') : null));

    const SATIR_CIZICILERI = {
      yeni: (tablo, o) => h('li', {}, h('div', { class: 'oge-satiri' }, ogeKutusu(tablo, o, 'yeni'),
        o.uygulanamaz ? h('span', { class: 'rozet uyari' }, o.uygulanamaz) : null)),
      degisen: (tablo, o) => h('li', {},
        h('div', { class: 'oge-satiri' }, ogeKutusu(tablo, o, 'değişen'), h('span', { class: 'rozet uyari' }, `${o.farklar.length} alan farklı`)),
        h('details', { class: 'fark' }, h('summary', {}, 'Farkları göster'), farkTablosu(o))),
      yalnizBurada: (_tablo, o) => h('li', {}, o.baslik)
    };

    /** Satırları SAYFA_BOYU'lık parçalarla çizen liste; kalan varsa "Daha fazla göster". */
    const sayfaliListe = (ogeler, satirCiz) => {
      const liste = h('ul', {});
      const dahaFazla = h('button', { type: 'button', class: 'kucuk-dugme daha-fazla' });
      let cizilen = 0;
      const ciz = () => {
        const son = Math.min(ogeler.length, cizilen + SAYFA_BOYU);
        liste.append(...ogeler.slice(cizilen, son).map(satirCiz));
        cizilen = son;
        const kalan = ogeler.length - cizilen;
        dahaFazla.hidden = kalan === 0;
        dahaFazla.textContent = `Daha fazla göster (${Math.min(kalan, SAYFA_BOYU)} kayıt daha, kalan ${kalan})`;
      };
      dahaFazla.addEventListener('click', () => {
        const ilk = cizilen;
        ciz();
        secimiGuncelle();
        // Odak yeni çizilen ilk satıra geçer (düğme son parçada gizlenir).
        const ilkSatir = /** @type {HTMLElement | undefined} */ (liste.children[ilk]);
        const odakKutusu = ilkSatir?.querySelector('input');
        if (odakKutusu) odakKutusu.focus();
        else if (ilkSatir) { ilkSatir.tabIndex = -1; ilkSatir.focus(); }
      });
      ciz();
      return [liste, dahaFazla];
    };

    const bolumler = [];
    for (const [tablo, v] of Object.entries(onizleme.varliklar)) {
      if (!v.yeni.length && !v.degisen.length && !v.yalnizBurada.length) {
        if (v.ayniSayisi) bolumler.push(h('p', { class: 'soluk kucuk' }, `${v.etiket}: ${v.ayniSayisi} kayıt iki tarafta da aynı.`));
        continue;
      }
      /** @type {Array<{ tablo: string; id: string }>} */
      const turOgeleri = [];
      const gruplar = [];
      const ozetParcalari = [];
      for (const g of GRUP_TANIMLARI) {
        const liste = v[g.anahtar];
        if (!liste.length) continue;
        ozetParcalari.push(`${liste.length} ${g.kisa}`);
        let kutu = null;
        let seciliMetni = null;
        if (g.secilebilir) {
          const ogeler = liste.map((o) => ({ tablo, id: o.id }));
          for (const o of ogeler) secimAyarla(tablo, o.id, true);
          secilebilirSayisi += ogeler.length;
          turOgeleri.push(...ogeler);
          tumOgeler.push(...ogeler);
          kutu = ucDurumluKutu(`Tümünü seç (${v.etiket}, ${g.kisa})`, ogeler);
          seciliMetni = h('span', { class: 'acilir-secili' });
          const s = seciliMetni;
          guncelleyiciler.push(() => { s.textContent = ` · ${seciliSay(ogeler)} seçili`; });
        }
        const { baslik, govde } = acilir('h4', kutu,
          [ikon(g.ikon), h('span', { class: 'acilir-ad' }, g.ad), h('span', { class: 'acilir-sayi' }, ` · ${liste.length} kayıt`), seciliMetni],
          () => [g.not ? h('p', { class: 'soluk kucuk' }, g.not) : null, ...sayfaliListe(liste, (o) => SATIR_CIZICILERI[g.anahtar](tablo, o))].filter(Boolean));
        gruplar.push(h('section', { class: `grup ${g.sinif}`, 'aria-label': `${v.etiket} — ${g.ad}` }, baslik, govde));
      }
      let turKutusu = null;
      let turSecili = null;
      if (turOgeleri.length) {
        turKutusu = ucDurumluKutu(`Tümünü seç (${v.etiket})`, turOgeleri);
        turSecili = h('span', { class: 'acilir-secili' });
        const s = turSecili;
        guncelleyiciler.push(() => { s.textContent = ` · ${seciliSay(turOgeleri)} seçili`; });
      }
      const { baslik, govde } = acilir('h3', turKutusu,
        [h('span', { class: 'acilir-ad' }, v.etiket), h('span', { class: 'acilir-sayi' }, ` — ${ozetParcalari.join(', ')}`), turSecili,
          v.ayniSayisi ? rozet(`${v.ayniSayisi} aynı`) : null].filter(Boolean),
        () => []);
      govde.append(...gruplar); // grup başlıkları hafiftir; satırlar grup açılınca çizilir
      bolumler.push(h('section', { class: 'varlik-bolumu', 'data-tablo': tablo, 'aria-label': v.etiket }, baslik, govde));
    }

    const eklenecekSatirlari = Object.entries(onizleme.eklenecekler).filter(([, e]) => e.dosyada > 0)
      .map(([tablo, e]) => h('li', {}, `${EKLEME_ETIKETLERI[tablo] || tablo}: ${e.yeni} eklenecek`,
        h('span', { class: 'soluk' }, ` (dosyada ${e.dosyada}; bu bilgisayarda olanlar atlanır)`)));

    const tumunuSec = (secili) => {
      for (const o of tumOgeler) secimAyarla(o.tablo, o.id, secili);
      secimiGuncelle();
    };
    const mesaj = mesajKutusu();
    const uygulaDugmesi = h('button', { type: 'button', class: 'birincil' }, 'Seçilenleri uygula');
    uygulaDugmesi.addEventListener('click', () => uygula(onizleme, secilen, uygulaDugmesi, mesaj));
    const t = onizleme.toplam;
    goster('onizleme', h('div', {},
      h('div', { class: 'sayfa-basligi' }, h('div', {},
        h('div', { class: 'kirinti' }, h('span', {}, 'Yedek'), h('span', { 'aria-hidden': 'true' }, '/'), h('span', { class: 'simdiki' }, 'Önizleme')),
        h('h2', {}, 'Yedek önizlemesi'),
        h('div', { class: 'meta' }, h('span', {}, ikon('takvim'), `Yedek tarihi: ${tarihMetni(onizleme.yedek.olusturulma)}`),
          onizleme.yedek.makine ? h('span', {}, ikon('bilgisayar'), `Kaynak bilgisayar: ${onizleme.yedek.makine}`) : null))),
      h('div', { class: 'sayac-cipleri' },
        h('span', { class: 'rozet hap basari' }, 'Yeni', h('b', {}, String(t.yeni))), h('span', { class: 'rozet hap uyari' }, 'Değişen', h('b', {}, String(t.degisen))),
        h('span', { class: 'rozet hap vurgu' }, 'Yalnızca bu bilgisayarda', h('b', {}, String(t.yalnizBurada))), h('span', { class: 'rozet hap' }, 'Aynı', h('b', {}, String(t.ayni))),
        h('span', { class: 'gorunmez' }, `Yeni: ${t.yeni}, Değişen: ${t.degisen}, Yalnızca bu bilgisayarda: ${t.yalnizBurada}, Aynı: ${t.ayni}`)),
      onizleme.kasaBenimsenecek
        ? h('div', { class: 'not-kutusu bilgi' }, h('p', {}, 'Bu bilgisayarda henüz kasa yok. Uyguladığınızda yedeğin parolası bu bilgisayarın kasa parolası olur.'))
        : null,
      eslemeBolumu(onizleme),
      bolumler.length ? bolumler : bosDurum('Yedekte bu bilgisayardan farklı bir ayar veya profil yok.', null, { ikon: 'onay' }),
      eklenecekSatirlari.length ? h('section', { class: 'grup', 'aria-label': 'Koşular ve geçmiş' },
        h('h4', {}, ikon('liste'), 'Koşular ve geçmiş kayıtları'),
        h('p', { class: 'soluk kucuk' }, 'Bu kayıtlar seçilmez; bu bilgisayarda olmayanlar her zaman eklenir.'),
        h('ul', {}, eklenecekSatirlari)) : null,
      medyaBolumu(onizleme.medya),
      h('div', { class: 'sabit-alt' }, mesaj.kutu, h('div', { class: 'dugmeler' }, uygulaDugmesi, h('button', { type: 'button', class: 'hayalet', onclick: iptalEt }, 'İptal'),
        h('span', { class: 'bosluk' }), secimSayaci,
        h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => tumunuSec(true) }, 'Tümünü seç'),
        h('button', { type: 'button', class: 'kucuk-dugme hayalet', onclick: () => tumunuSec(false) }, 'Hiçbirini seçme')))));
    secimiGuncelle();
    // Eşleme değişince önizleme yeniden çizilir: odak değiştirilen seçime döner.
    if (odak) kapsayici.querySelector(odak)?.focus();
  }

  async function uygula(onizleme, secilen, dugme, mesaj) {
    mesaj.temizle();
    const secimler = {};
    for (const [tablo, idler] of secilen) if (idler.size) secimler[tablo] = [...idler];
    dugme.disabled = true;
    dugme.textContent = 'Uygulanıyor…';
    try {
      // Eşleme seçildiyse aynı eşlemeyle uygulanır (önizlemedeki kimlikler aynı kalır); yoksa bugünkü davranış.
      const esleme = onizleme.projeEslemesi && onizleme.projeEslemesi.uygulanan;
      const { sonuc } = await api(`/platform/yedek/ice-aktar/${isId}/uygula`, { govde: esleme ? { secimler, esleme } : { secimler } });
      isId = null;
      ozetEkrani(onizleme, sonuc);
    } catch (hata) {
      mesaj.goster(hata.message);
      dugme.disabled = false;
      dugme.textContent = 'Seçilenleri uygula';
    }
  }

  // --- 4) Özet --------------------------------------------------------------------------
  function ozetEkrani(onizleme, sonuc) {
    const baslikBul = (tablo, id) => {
      const v = onizleme.varliklar[tablo];
      const oge = v && [...v.yeni, ...v.degisen].find((o) => o.id === id);
      return oge ? oge.baslik : id;
    };
    const varlikSatirlari = Object.entries(sonuc.varliklar)
      .filter(([, s]) => s.eklenen || s.uzerineYazilan || s.atlanan)
      .map(([tablo, s]) => h('tr', {}, h('th', { scope: 'row' }, (onizleme.varliklar[tablo] || {}).etiket || tablo),
        h('td', {}, String(s.eklenen)), h('td', {}, String(s.uzerineYazilan)), h('td', {}, String(s.atlanan))));
    const eklemeSatirlari = Object.entries(sonuc.eklenenler).filter(([, s]) => s.eklenen || s.mevcut || s.atlanan)
      .map(([tablo, s]) => h('li', {}, `${EKLEME_ETIKETLERI[tablo] || tablo}: ${s.eklenen} eklendi`,
        s.mevcut ? `, ${s.mevcut} zaten vardı` : '', s.atlanan ? `, ${s.atlanan} atlandı` : ''));
    const devam = h('button', { type: 'button', class: 'birincil', onclick: () => secenekler.bitti() }, 'Devam');
    goster('ozet', h('div', { class: 'kart' },
      h('h2', {}, ikon('onay'), 'İçe aktarma tamamlandı'),
      sonuc.tamYukleme ? h('p', {}, 'Yedeğin tamamı bu bilgisayara yüklendi.') : null,
      sonuc.projeEslemesi && sonuc.projeEslemesi.ozet.length
        ? h('ul', { class: 'duz-liste esleme-sonucu' }, sonuc.projeEslemesi.ozet.map((o) => h('li', {}, o.metin)))
        : null,
      sonuc.kalintilar && Object.keys(sonuc.kalintilar).length
        ? h('div', { class: 'not-kutusu uyari', role: 'note' }, Object.entries(sonuc.kalintilar).map(([p, k]) => {
          const o = ((sonuc.projeEslemesi && sonuc.projeEslemesi.ozet) || []).find((x) => x.kaynak.id === p);
          return h('p', {}, `Silinmiş "${o ? o.kaynak.ad : p}" projesinden kalan ve seçilmediği için taşınmayan kayıtlar duruyor (${kalintiMetni(k)}). Aynı yedeği yeniden içe aktarıp bu kayıtları seçerseniz "${o ? o.hedef.ad : ''}" projesine taşınır.`);
        }))
        : null,
      varlikSatirlari.length ? h('div', { class: 'tablo-kaydirma' }, h('table', { class: 'ozet-tablosu' },
        h('caption', { class: 'gorunmez' }, 'Varlık türüne göre uygulanan değişiklikler'),
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Tür'), h('th', { scope: 'col' }, 'Eklenen'), h('th', { scope: 'col' }, 'Güncellenen'), h('th', { scope: 'col' }, 'Atlanan'))),
        h('tbody', {}, varlikSatirlari))) : h('p', { class: 'soluk' }, 'Ayar veya profil değişikliği uygulanmadı.'),
      eklemeSatirlari.length ? [h('h3', { class: 'ara-baslik' }, 'Koşular ve geçmiş'), h('ul', { class: 'duz-liste' }, eklemeSatirlari)] : null,
      sonuc.otomatikEklenenUstKayitlar.length ? [
        h('h3', { class: 'ara-baslik' }, 'Otomatik eklenen üst kayıtlar'),
        h('p', { class: 'soluk' }, 'Seçtiğiniz kayıtların ihtiyaç duyduğu şu kayıtlar bu bilgisayarda olmadığı için otomatik eklendi:'),
        h('ul', {}, sonuc.otomatikEklenenUstKayitlar.map((u) => h('li', {}, `${(onizleme.varliklar[u.tablo] || {}).etiket || u.tablo}: ${baslikBul(u.tablo, u.id)}`)))
      ] : null,
      sonuc.atlananlar.length ? [
        h('h3', { class: 'ara-baslik' }, 'Atlanan kayıtlar'),
        h('ul', {}, sonuc.atlananlar.map((a) => h('li', {}, `${(onizleme.varliklar[a.tablo] || {}).etiket || a.tablo}: ${baslikBul(a.tablo, a.id)} — ${a.neden}`)))
      ] : null,
      sonuc.gecmiseYazilan ? h('p', { class: 'soluk' }, `Üzerine yazılan ${sonuc.gecmiseYazilan} yerel sürüm değişiklik geçmişinde saklandı.`) : null,
      sonuc.medya && (sonuc.medya.eklenen || sonuc.medya.dahilDegil)
        ? h('p', { class: 'medya-ozeti' }, `Medya: ${sonuc.medya.eklenen} dosya eklendi (${boyutMetni(sonuc.medya.bayt)})`,
          sonuc.medya.dahilDegil ? `; ${sonuc.medya.dahilDegil} medya yedeğe dahil edilmemişti` : '', '.')
        : null,
      sonuc.medyaHatasi ? h('div', { class: 'not-kutusu hata' }, sonuc.medyaHatasi) : null,
      h('div', { class: 'dugmeler' }, devam)));
  }

  dosyaFormu();
}
