// Yedek içe aktarma akışı: dosya + parola → yükleme (ilerleme) → ÖNİZLEME (Yeni / Değişen /
// Yalnızca bu bilgisayarda) → seçim → uygulama → özet. Hoş geldiniz ekranında (boş veritabanı:
// yedeğin parolası bu bilgisayarın kasa parolası olur) ve Ayarlar > Yedekleme'de kullanılır.
import {
  ApiHatasi, TOKEN, alan, alanHatasi, api, geriSayim, h, mesajKutusu, parolaAlani, tarihMetni, yeniKimlik
} from './ortak.js';

const ALAN_ETIKETLERI = {
  ad: 'Ad', aciklama: 'Açıklama', ayarlar_json: 'Ayarlar', taban_url: 'Adres', varsayilan: 'Varsayılan',
  proje_id: 'Proje', ortam_id: 'Ortam', kullanici_adi: 'Kullanıcı adı', parola: 'Parola',
  iki_asamali_tur: 'İki aşamalı doğrulama', totp_gizli: 'Authenticator gizli anahtarı', sms_ayari_json: 'SMS ayarı',
  tur: 'Tür', alanlar_json: 'Alanlar', tur_id: 'Test verisi türü', degerler_json: 'Değerler', anahtar: 'Anahtar',
  ekran_id: 'Ekran', surum: 'Sürüm', model_json: 'Model', baslik: 'Başlık', icerik_json: 'İçerik',
  kosuya_dahil: 'Koşuya dahil', deger_json: 'Değer'
};
const EKLEME_ETIKETLERI = {
  kosular: 'Koşular', kosu_sonuclari: 'Koşu sonuçları', degisiklik_gecmisi: 'Değişiklik geçmişi kayıtları', makineler: 'Bilgisayar kayıtları'
};
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
  const goster = (...icerik) => {
    kapsayici.replaceChildren(...icerik);
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
    const parola = parolaAlani('Yedeğin parolası', {
      zorunlu: true, otomatik: 'current-password',
      yardim: secenekler.mod === 'hosgeldin'
        ? 'Yedeği oluşturan bilgisayardaki kasa parolası. Bu bilgisayarda da kasa parolası olarak kullanılacak.'
        : 'Yedeği oluşturan kasanın parolası (bu bilgisayarın parolasından farklı olabilir).'
    });
    const mesaj = mesajKutusu();
    const gonder = h('button', { type: 'submit', class: 'birincil' }, 'Yükle ve önizle');
    const form = h('form', { class: 'kart', novalidate: true },
      h('h2', {}, 'Yedek yükle'),
      h('p', { class: 'soluk' }, 'Bir .tayedek dosyası seçin. Uygulamadan önce neyin ekleneceğini ve neyin değişeceğini göreceksiniz; bu bilgisayardaki hiçbir kayıt silinmez.'),
      mesaj.kutu,
      alan('Yedek dosyası', dosyaGirdisi, { zorunlu: true, yardim: 'Yalnızca bu platformun ürettiği .tayedek dosyaları.' }),
      parola.kapsayici,
      h('div', { class: 'dugmeler' }, gonder, h('button', { type: 'button', onclick: iptalEt }, 'Vazgeç')));
    if (onMesaj) mesaj.goster(onMesaj.metin, onMesaj.tur);
    form.addEventListener('submit', (olay) => {
      olay.preventDefault();
      alanHatasi(dosyaGirdisi, '');
      alanHatasi(parola.girdi, '');
      const dosya = dosyaGirdisi.files && dosyaGirdisi.files[0];
      let hata = false;
      if (!dosya) { alanHatasi(dosyaGirdisi, 'Bir yedek dosyası seçin.'); hata = true; }
      else if (!dosya.name.toLowerCase().endsWith('.tayedek')) { alanHatasi(dosyaGirdisi, 'Dosya uzantısı .tayedek olmalıdır.'); hata = true; }
      if (!parola.girdi.value) { alanHatasi(parola.girdi, 'Yedeğin parolasını girin.'); hata = true; }
      if (hata) { form.querySelector('[aria-invalid="true"]')?.focus(); return; }
      yukle(dosya, parola.girdi.value);
    });
    goster(form);
  }

  // --- 2) Yükleme + hazırlık ilerlemesi -----------------------------------------------
  function ilerlemeEkrani() {
    const cubuk = h('progress', { max: '100', value: '0', 'aria-labelledby': 'ilerleme-metni' });
    const metin = h('p', { id: 'ilerleme-metni', 'aria-live': 'polite' }, 'Dosya yükleniyor… %0');
    goster(h('div', { class: 'kart' }, h('h2', {}, 'Yedek hazırlanıyor'), metin, cubuk,
      h('div', { class: 'dugmeler' }, h('button', { type: 'button', onclick: iptalEt }, 'İptal'))));
    return (asama, yuzde) => {
      cubuk.value = yuzde;
      metin.textContent = `${asama} %${Math.round(yuzde)}`;
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
      if (is.durum === 'hazir' && is.onizleme) { onizlemeEkrani(is.onizleme); return; }
      isId = null;
      dosyaFormu({ metin: is.mesaj || 'İçe aktarma hazırlanamadı.', tur: 'hata' });
      return;
    }
  }

  // --- 3) Önizleme ve seçim ------------------------------------------------------------
  function onizlemeEkrani(onizleme) {
    /** @type {Map<string, Set<string>>} */
    const secilen = new Map();
    /** @type {Array<{ tablo: string; id: string; kutu: HTMLInputElement }>} */
    const tumKutular = [];
    const grupGuncelleyiciler = [];
    const secimSayaci = h('p', { 'aria-live': 'polite', class: 'soluk' });
    const secimiGuncelle = () => {
      let toplam = 0;
      for (const s of secilen.values()) toplam += s.size;
      secimSayaci.textContent = `Seçili: ${toplam} / ${tumKutular.length} kayıt`;
      for (const g of grupGuncelleyiciler) g();
    };
    const secimAyarla = (tablo, id, secili) => {
      if (!secilen.has(tablo)) secilen.set(tablo, new Set());
      if (secili) secilen.get(tablo).add(id); else secilen.get(tablo).delete(id);
    };

    const ogeKutusu = (tablo, oge, grupAdi) => {
      const kutu = h('input', { type: 'checkbox', checked: true, id: yeniKimlik('sec') });
      secimAyarla(tablo, oge.id, true);
      kutu.addEventListener('change', () => { secimAyarla(tablo, oge.id, kutu.checked); secimiGuncelle(); });
      tumKutular.push({ tablo, id: oge.id, kutu });
      return h('label', { class: 'secenek', for: kutu.id }, kutu,
        h('span', {}, oge.baslik, h('span', { class: 'gorunmez' }, ` (${grupAdi})`)));
    };

    const grupSecimi = (baslik, kutular) => {
      const hepsi = h('input', { type: 'checkbox', id: yeniKimlik('grup') });
      const guncelle = () => {
        const secili = kutular.filter((k) => k.kutu.checked).length;
        hepsi.checked = secili === kutular.length;
        hepsi.indeterminate = secili > 0 && secili < kutular.length;
      };
      hepsi.addEventListener('change', () => {
        for (const k of kutular) { k.kutu.checked = hepsi.checked; secimAyarla(k.tablo, k.id, hepsi.checked); }
        secimiGuncelle();
      });
      grupGuncelleyiciler.push(guncelle);
      return h('label', { class: 'secenek kucuk', for: hepsi.id }, hepsi, `Tümünü seç (${baslik})`);
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

    const bolumler = [];
    for (const [tablo, v] of Object.entries(onizleme.varliklar)) {
      if (!v.yeni.length && !v.degisen.length && !v.yalnizBurada.length) {
        if (v.ayniSayisi) bolumler.push(h('p', { class: 'soluk kucuk' }, `${v.etiket}: ${v.ayniSayisi} kayıt iki tarafta da aynı.`));
        continue;
      }
      const gruplar = [];
      if (v.yeni.length) {
        const baslangic = tumKutular.length;
        const ogeler = v.yeni.map((o) => h('li', {}, h('div', { class: 'oge-satiri' }, ogeKutusu(tablo, o, 'yeni'),
          o.uygulanamaz ? h('span', { class: 'rozet uyari' }, o.uygulanamaz) : null)));
        const kutular = tumKutular.slice(baslangic);
        gruplar.push(h('section', { class: 'grup', 'aria-label': `${v.etiket} — Yeni` },
          h('div', { class: 'grup-basligi' }, h('h4', {}, `Yeni (${v.yeni.length})`), grupSecimi(`${v.etiket}, yeni`, kutular)),
          h('ul', {}, ogeler)));
      }
      if (v.degisen.length) {
        const baslangic = tumKutular.length;
        const ogeler = v.degisen.map((o) => h('li', {},
          h('div', { class: 'oge-satiri' }, ogeKutusu(tablo, o, 'değişen'),
            h('span', { class: 'rozet uyari' }, `${o.farklar.length} alan farklı`)),
          h('details', { class: 'fark' }, h('summary', {}, 'Farkları göster'), farkTablosu(o))));
        const kutular = tumKutular.slice(baslangic);
        gruplar.push(h('section', { class: 'grup', 'aria-label': `${v.etiket} — Değişen` },
          h('div', { class: 'grup-basligi' }, h('h4', {}, `Değişen (${v.degisen.length})`), grupSecimi(`${v.etiket}, değişen`, kutular)),
          h('p', { class: 'soluk kucuk' }, 'Seçilirse yedekteki sürüm bu bilgisayardakinin yerine geçer; bu bilgisayardaki sürüm değişiklik geçmişinde saklanır.'),
          h('ul', {}, ogeler)));
      }
      if (v.yalnizBurada.length) {
        gruplar.push(h('section', { class: 'grup', 'aria-label': `${v.etiket} — Yalnızca bu bilgisayarda` },
          h('div', { class: 'grup-basligi' }, h('h4', {}, `Yalnızca bu bilgisayarda (${v.yalnizBurada.length})`)),
          h('p', { class: 'soluk kucuk' }, 'Bilgi amaçlıdır: içe aktarma bu kayıtları silmez veya değiştirmez.'),
          h('ul', {}, v.yalnizBurada.map((o) => h('li', {}, o.baslik)))));
      }
      bolumler.push(h('section', { class: 'varlik-bolumu', 'data-tablo': tablo },
        h('h3', {}, v.etiket, v.ayniSayisi ? h('span', { class: 'soluk kucuk' }, `${v.ayniSayisi} aynı`) : null), gruplar));
    }

    const eklenecekSatirlari = Object.entries(onizleme.eklenecekler).filter(([, e]) => e.dosyada > 0)
      .map(([tablo, e]) => h('li', {}, `${EKLEME_ETIKETLERI[tablo] || tablo}: ${e.yeni} eklenecek`,
        h('span', { class: 'soluk' }, ` (dosyada ${e.dosyada}; bu bilgisayarda olanlar atlanır)`)));

    const tumunuSec = (secili) => {
      for (const k of tumKutular) { k.kutu.checked = secili; secimAyarla(k.tablo, k.id, secili); }
      secimiGuncelle();
    };
    const mesaj = mesajKutusu();
    const uygulaDugmesi = h('button', { type: 'button', class: 'birincil' }, 'Seçilenleri uygula');
    uygulaDugmesi.addEventListener('click', () => uygula(onizleme, secilen, uygulaDugmesi, mesaj));
    const t = onizleme.toplam;
    goster(h('div', {},
      h('h2', {}, 'Yedek önizlemesi'),
      h('p', { class: 'soluk' }, `Yedek tarihi: ${tarihMetni(onizleme.yedek.olusturulma)}`,
        onizleme.yedek.makine ? ` · Kaynak bilgisayar: ${onizleme.yedek.makine}` : ''),
      h('div', { class: 'sayac-cipleri' },
        h('span', { class: 'rozet vurgu' }, `Yeni: ${t.yeni}`), h('span', { class: 'rozet uyari' }, `Değişen: ${t.degisen}`),
        h('span', { class: 'rozet' }, `Yalnızca bu bilgisayarda: ${t.yalnizBurada}`), h('span', { class: 'rozet basari' }, `Aynı: ${t.ayni}`)),
      onizleme.kasaBenimsenecek
        ? h('div', { class: 'not-kutusu bilgi' }, h('p', {}, 'Bu bilgisayarda henüz kasa yok. Uyguladığınızda yedeğin parolası bu bilgisayarın kasa parolası olur.'))
        : null,
      h('div', { class: 'dugmeler' },
        h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => tumunuSec(true) }, 'Tümünü seç'),
        h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => tumunuSec(false) }, 'Hiçbirini seçme')),
      secimSayaci,
      bolumler.length ? bolumler : h('p', { class: 'bos-liste' }, 'Yedekte bu bilgisayardan farklı bir ayar veya profil yok.'),
      eklenecekSatirlari.length ? h('section', { class: 'grup', 'aria-label': 'Koşular ve geçmiş' },
        h('h4', {}, 'Koşular ve geçmiş kayıtları'),
        h('p', { class: 'soluk kucuk' }, 'Bu kayıtlar seçilmez; bu bilgisayarda olmayanlar her zaman eklenir.'),
        h('ul', {}, eklenecekSatirlari)) : null,
      h('div', { class: 'sabit-alt' }, mesaj.kutu, h('div', { class: 'dugmeler' }, uygulaDugmesi, h('button', { type: 'button', onclick: iptalEt }, 'İptal')))));
    secimiGuncelle();
  }

  async function uygula(onizleme, secilen, dugme, mesaj) {
    mesaj.temizle();
    const secimler = {};
    for (const [tablo, idler] of secilen) if (idler.size) secimler[tablo] = [...idler];
    dugme.disabled = true;
    dugme.textContent = 'Uygulanıyor…';
    try {
      const { sonuc } = await api(`/platform/yedek/ice-aktar/${isId}/uygula`, { govde: { secimler } });
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
    goster(h('div', { class: 'kart' },
      h('h2', {}, 'İçe aktarma tamamlandı'),
      sonuc.tamYukleme ? h('p', {}, 'Yedeğin tamamı bu bilgisayara yüklendi.') : null,
      varlikSatirlari.length ? h('div', { class: 'tablo-kaydirma' }, h('table', { class: 'ozet-tablosu' },
        h('caption', { class: 'gorunmez' }, 'Varlık türüne göre uygulanan değişiklikler'),
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Tür'), h('th', { scope: 'col' }, 'Eklenen'), h('th', { scope: 'col' }, 'Güncellenen'), h('th', { scope: 'col' }, 'Atlanan'))),
        h('tbody', {}, varlikSatirlari))) : h('p', { class: 'soluk' }, 'Ayar veya profil değişikliği uygulanmadı.'),
      eklemeSatirlari.length ? [h('h3', {}, 'Koşular ve geçmiş'), h('ul', {}, eklemeSatirlari)] : null,
      sonuc.otomatikEklenenUstKayitlar.length ? [
        h('h3', {}, 'Otomatik eklenen üst kayıtlar'),
        h('p', { class: 'soluk' }, 'Seçtiğiniz kayıtların ihtiyaç duyduğu şu kayıtlar bu bilgisayarda olmadığı için otomatik eklendi:'),
        h('ul', {}, sonuc.otomatikEklenenUstKayitlar.map((u) => h('li', {}, `${(onizleme.varliklar[u.tablo] || {}).etiket || u.tablo}: ${baslikBul(u.tablo, u.id)}`)))
      ] : null,
      sonuc.atlananlar.length ? [
        h('h3', {}, 'Atlanan kayıtlar'),
        h('ul', {}, sonuc.atlananlar.map((a) => h('li', {}, `${(onizleme.varliklar[a.tablo] || {}).etiket || a.tablo}: ${baslikBul(a.tablo, a.id)} — ${a.neden}`)))
      ] : null,
      sonuc.gecmiseYazilan ? h('p', { class: 'soluk' }, `Üzerine yazılan ${sonuc.gecmiseYazilan} yerel sürüm değişiklik geçmişinde saklandı.`) : null,
      h('div', { class: 'dugmeler' }, devam)));
  }

  dosyaFormu();
}
