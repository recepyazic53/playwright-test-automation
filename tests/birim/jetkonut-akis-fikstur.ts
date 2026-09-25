// YEREL FİKSTÜR — JetKonut benzeri teklif ekranı (girişsiz; 127.0.0.1). "JetKonut (akış)" paketinin
// (projeler/galaksi/jetkonut-akis.mjs) model koşucusuyla uçtan uca denenmesi içindir. Seçiciler ve davranış JetKonut
// POM'undakilerle aynıdır: özel çizimli radyolar ve onay kutuları (gizli girdiler), telefon kodu + numarası, tipe göre
// görünen doğum tarihi, "CheckIdentity('INSURED' / 'CLIENT')" sorgu bağlantıları ve sonuçla görünen detay kutuları, farklı
// sigorta ettiren bölümü, UAVT adres sorgusu (#DR "-1"den çıkar; yükleme örtüsü), GİZLİ (jqTransform) açılır listeler
// (toplam kat seçilince bulunduğu kat listesi örtüyle yenilenir), mal sahibinde görünen brüt m² / DASK'a bağlılık / bina
// yangın bedeli, "Standart" → "Sonraki Adım" → teminatlar → "Teklif Hesapla" → "Teklif Kaydet" (ya da "JetKonut Hızlı Teklif
// Ekranı" hata penceresi) ve kredi kartı ödemesi. Şirket sitesine hiçbir istek gitmez.
import type { FiksturIstegi, FiksturUygulamasi, FiksturYaniti } from './giris-fikstur';

export const KONUT_YOLU = '/jet-satis/jet-konut/';
/** Ödeme sonucu (TEST'te test kartıyla poliçe kesilmez). */
export const KONUT_ODEME_SONUCU = 'Hiçbir poliçe onaylanamadı.';
/** Sunucunun iş kuralı uyarısı (inşa yılı 1950'den önceyse). */
export const KONUT_INSA_YILI_UYARISI = 'Bina inşa yılı geçersiz.';
/** Liste seçenekleri (fikstürün; gerçek ekranın listeleri TEST'ten okunacak). Metinler sayfada tekil (metinle seçim). */
export const KONUT_LISTELERI: Record<string, Array<[string, string]>> = {
  BuildingType: [['1', 'Apartman'], ['2', 'Müstakil Ev']],
  AlternativePlus: [['0', 'Plus Yok'], ['1', 'Plus Var']],
  Alternative: [['1', 'Alternatif 1'], ['2', 'Alternatif 2']],
  ConstructionType: [['1', 'Betonarme'], ['2', 'Yığma']],
  TotalFloor: [['1', '1 - 3 Kat'], ['2', '4 - 7 Kat']],
  RiskFloor: [],
  RoofType: [['1', 'Beton Çatı'], ['2', 'Kiremit Çatı']],
  PersonalAccidentLimit: [['0', 'Ferdi Kaza Yok'], ['5000', 'Ferdi Kaza 5.000']],
  LegalProtection: [['0', 'Hukuksal Koruma Yok'], ['1', 'Hukuksal Koruma Var']],
  InflationRate: [['0', 'Enflasyon %0'], ['50', 'Enflasyon %50']]
};
/** Toplam kata göre bulunduğu kat seçenekleri (sayfada kat seçilince yenilenir). */
export const KONUT_KATLARI: Record<string, Array<[string, string]>> = {
  '1': [['0', 'Zemin Kat'], ['1', '1. Kat']],
  '2': [['0', 'Zemin Kat'], ['1', '1. Kat'], ['5', '5. Kat']]
};

export type KonutTeklifi = Record<string, unknown>;

const html = (govde: string): FiksturYaniti => ({
  tur: 'text/html; charset=utf-8',
  govde: `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>JetKonut</title>
<style>[hidden]{display:none!important}body{font:14px system-ui;margin:24px}label{display:block;margin:6px 0}.radyo,.onay{position:relative;display:inline-block;margin-right:12px}
.radyo input,.onay input{position:absolute;opacity:0;width:14px;height:14px;margin:0}.radyo span,.onay span{padding-left:18px}
.jqTransformSelectWrapper{display:inline-block;margin:4px 12px 4px 0}.jqTransformSelectOpen{padding:0 6px}.jqTransformHidden{display:none}
.blockUI.blockOverlay{position:fixed;inset:0;background:rgba(0,0,0,.2)}</style></head><body>${govde}</body></html>`
});
const json = (veri: unknown): FiksturYaniti => ({ tur: 'application/json', govde: JSON.stringify(veri) });

export class KonutUygulamasi {
  readonly teklifler: KonutTeklifi[] = [];
  readonly odemeler: Array<Record<string, unknown>> = [];
  readonly olaylar: string[] = [];

  readonly isle: FiksturUygulamasi = (i: FiksturIstegi) => {
    this.olaylar.push(`${i.yontem} ${i.yol}`);
    if (i.yol === KONUT_YOLU || i.yol === KONUT_YOLU.slice(0, -1)) return this.sayfa();
    if (i.yol === '/konut/kimlik') {
      const no = i.sorgu.get('no') ?? '';
      // Kodlu testteki gibi telefon (kod + numara) doldurulur; eksikse sorgu reddedilir.
      if (!no || !i.sorgu.get('kod') || !i.sorgu.get('tel')) return json({ Status: false, Data: 'Telefon ve kimlik no zorunludur.' });
      return json({ Status: true, Data: i.sorgu.get('tip') === 'T' ? `UNVAN ${no.slice(-3)} A.Ş.` : `KİŞİ ${no.slice(-3)}` });
    }
    if (i.yol === '/konut/uavt') return json({ Status: true, Data: `D${(i.sorgu.get('ak') ?? '').slice(-3)}` });
    if (i.yol === '/konut/odeme' && i.yontem === 'POST') {
      this.odemeler.push(JSON.parse(i.govde || '{}') as Record<string, unknown>);
      return json({ mesaj: KONUT_ODEME_SONUCU });
    }
    if (i.yol === '/jet-satis/jet-konut/teklif' && i.yontem === 'POST') {
      const g = JSON.parse(i.govde || '{}') as Record<string, unknown>;
      this.teklifler.push(g);
      if (Number(g.insaYili) < 1950) return json({ Status: false, Data: KONUT_INSA_YILI_UYARISI });
      if (!g.ad || !g.dr || g.dr === '-1') return json({ Status: false, Data: 'Eksik bilgi.' });
      return json({ Status: true, Data: '1.234,56' });
    }
    return { durum: 404, tur: 'text/plain', govde: 'yok' };
  };

  private sayfa(): FiksturYaniti {
    const radyo = (ad: string, deger: string, metin: string, secili = false) =>
      `<label class="radyo"><input type="radio" name="${ad}" id="${ad}-${deger}" value="${deger}"${secili ? ' checked' : ''}><span>${metin}</span><a href="#"></a></label>`;
    const onay = (id: string, metin: string) => `<label class="onay"><input type="checkbox" id="${id}"><span>${metin}</span><a href="#"></a></label>`;
    // jqTransform benzeri: <select> gizli; açıcı (a.jqTransformSelectOpen) ve seçenek bağlantıları (ul li a[index]) görünür.
    const liste = (id: string, etiket: string) => `<label>${etiket}</label><div class="jqTransformSelectWrapper"><div><span>Seçiniz</span><a href="#" class="jqTransformSelectOpen">▼</a></div>
      <ul hidden></ul><select id="${id}" class="jqTransformHidden"><option value="">Seçiniz</option>${(KONUT_LISTELERI[id] ?? []).map(([d, m]) => `<option value="${d}">${m}</option>`).join('')}</select></div>`;
    const kimlik = (on: string, baslik: string, rol: string) => `
        <label>Telefon kodu <input id="${on}TelefonKodu"></label><label>Telefon <input id="${on}Telefonu"></label>
        <label class="dogum">Doğum tarihi <input id="${on}BirthDate"></label>
        <label>Kimlik no <input id="${on}IdentityNumber"></label>
        <a href="javascript:CheckIdentity('${rol}')">Sorgula</a>
        <div id="${on}IdentityDetail" hidden><b>${baslik}</b> <span class="ad"></span></div>`;
    return html(`<h1>JetKonut</h1>
      <section id="sigortali"><h2>Sigortalı Bilgileri</h2>
        ${radyo('CustomerType', 'O', 'Özel', true)}${radyo('CustomerType', 'T', 'Tüzel')}${kimlik('', 'Sigortalı', 'INSURED')}
      </section>
      <section><h2>Sigorta Ettiren</h2>${radyo('DifferentClient', 'H', 'Aynı')}${radyo('DifferentClient', 'E', 'Farklı')}
        <div id="ettiren" hidden>${radyo('ClientType', 'O', 'Özel ettiren', true)}${radyo('ClientType', 'T', 'Tüzel ettiren')}${kimlik('Client', 'Sigorta Ettiren', 'CLIENT')}</div>
      </section>
      <section id="riziko"><h2>Riziko</h2>
        <label>Adres kodu <input id="AK"></label><button id="RefreshUAVT" type="button">Adres sorgula</button>
        <label>Adres <select id="DR"><option value="-1">Seçiniz</option></select></label>
        <label>Başlangıç <input id="BeginDate" readonly></label>
        ${radyo('IsOwner', 'E', 'Mal sahibi')}${radyo('IsOwner', 'H', 'Kiracı')}
        ${liste('BuildingType', 'Bina tipi')}
        <div class="mal-sahibi"><label>Brüt m² <input id="GrossAreaM2"></label>${radyo('IsDASKDepended', 'E', 'DASK bağlı')}${radyo('IsDASKDepended', 'H', 'DASK bağlı değil')}</div>
        ${radyo('IsHaveLossPayee', 'E', 'Dain-i mürtehin var')}${radyo('IsHaveLossPayee', 'H', 'Dain-i mürtehin yok', true)}
        ${liste('AlternativePlus', 'Alternatif plus')}${liste('Alternative', 'Alternatif')}${liste('ConstructionType', 'Yapı tarzı')}
        ${liste('TotalFloor', 'Toplam kat')}${liste('RiskFloor', 'Bulunduğu kat')}${liste('RoofType', 'Çatı tipi')}
        ${radyo('BlankMoreThan60Days', 'E', '60 günden fazla boş')}${radyo('BlankMoreThan60Days', 'H', '60 günden fazla boş değil', true)}
        <label>İnşa yılı <input id="BuildYear"></label>
      </section>
      <button id="btnStandart" type="button">Standart</button>
      <section id="teminatlar" hidden><h2>Teminatlar</h2>
        <label class="mal-sahibi">Bina yangın <input id="C1000"></label><label>Eşya yangın <input id="C1008"></label>
        <label>Dahili dekorasyon <input id="C1089"></label><label>Cam kırılması <input id="C1036"></label>
        ${onay('C1016', 'Eşya deprem')}${onay('C1087', 'Dahili dekorasyon deprem')}${onay('C1090', 'Hırsızlık')}${onay('C1092', 'Bina sabit kıymet hırsızlık')}
        ${liste('PersonalAccidentLimit', 'Ferdi kaza')}${liste('LegalProtection', 'Hukuksal koruma')}${liste('InflationRate', 'Enflasyon')}
      </section>
      <button id="TeklifHesaplaButon" type="button" hidden>Sonraki Adım</button>
      <p id="prim"></p>
      <button id="TeklifKaydetButon" type="button" hidden>Teklif Kaydet</button>
      <div id="hata-penceresi" class="ui-dialog" hidden><div class="baslik"><span>JetKonut Hızlı Teklif Ekranı</span></div><div id="hata-metni"></div></div>
      <div id="fancybox-wrap" hidden><a href="#" id="kart-baglantisi">KREDİ KARTI İLE POLİÇELEŞTİR</a></div>
      <div id="kart-formu" hidden>
        <label>Kart üzerindeki isim <input id="isim"></label><label>Kart üzerindeki soyisim <input id="soyisim"></label>
        <label>Kart numarası <input id="kartno"></label><label>Güvenlik kodu (CVV) <input id="cvv"></label>
        <label>Ay <select id="ay">${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${String(i + 1).padStart(2, '0')}</option>`).join('')}</select></label>
        <label>Yıl <select id="yil">${Array.from({ length: 11 }, (_, i) => `<option value="${2026 + i}">${2026 + i}</option>`).join('')}</select></label>
        <a href="#" id="odemeyi-tamamla">Ödemeyi tamamla</a>
      </div>
      <script>
        const KATLAR = ${JSON.stringify(KONUT_KATLARI)};
        const $ = (id) => document.getElementById(id);
        const secili = (ad) => { const r = document.querySelector('input[name=' + ad + ']:checked'); return r ? r.value : null; };
        const deger = (id) => $(id).value;
        // Yükleme örtüsü (.blockUI.blockOverlay): istek sürerken görünür.
        const ortu = (ms) => { const o = document.createElement('div'); o.className = 'blockUI blockOverlay'; document.body.appendChild(o); setTimeout(() => o.remove(), ms); };
        const gorunurluk = () => {
          const t = secili('CustomerType'), ct = secili('ClientType'), mal = secili('IsOwner') === 'E';
          document.querySelector('#sigortali .dogum').hidden = t === 'T';
          $('ettiren').hidden = secili('DifferentClient') !== 'E';
          document.querySelector('#ettiren .dogum').hidden = ct === 'T';
          document.querySelectorAll('.mal-sahibi').forEach((e) => { e.hidden = !mal; });
        };
        document.querySelectorAll('input[type=radio]').forEach((r) => r.addEventListener('change', gorunurluk));
        gorunurluk();
        // jqTransform benzeri listeler.
        const listeyiCiz = (w) => {
          const s = w.querySelector('select'), ul = w.querySelector('ul');
          ul.innerHTML = Array.from(s.options).map((o, i) => '<li><a href="#" index="' + i + '">' + o.text + '</a></li>').join('');
          w.querySelector('span').textContent = s.options[s.selectedIndex] ? s.options[s.selectedIndex].text : '';
        };
        document.querySelectorAll('.jqTransformSelectWrapper').forEach((w) => {
          listeyiCiz(w);
          w.querySelector('.jqTransformSelectOpen').onclick = (o) => { o.preventDefault(); w.querySelector('ul').hidden = !w.querySelector('ul').hidden; };
          w.querySelector('ul').addEventListener('click', (o) => {
            const a = o.target.closest('a'); if (!a) return; o.preventDefault();
            const s = w.querySelector('select'); s.selectedIndex = Number(a.getAttribute('index'));
            w.querySelector('ul').hidden = true; listeyiCiz(w); s.dispatchEvent(new Event('change', { bubbles: true }));
          });
        });
        // Toplam kat değişince bulunduğu kat listesi (örtü altında) yenilenir; önceki seçim kaybolur.
        $('TotalFloor').addEventListener('change', () => {
          ortu(400);
          setTimeout(() => {
            const rf = $('RiskFloor');
            rf.innerHTML = '<option value="">Seçiniz</option>' + (KATLAR[deger('TotalFloor')] || []).map(([d, m]) => '<option value="' + d + '">' + m + '</option>').join('');
            listeyiCiz(rf.closest('.jqTransformSelectWrapper'));
          }, 300);
        });
        // javascript: bağlantısından çağrılır: undefined dönmeli (dönen değer sayfanın yerine geçer).
        window.CheckIdentity = (rol) => { void kimlikSorgula(rol); };
        const kimlikSorgula = async (rol) => {
          const on = rol === 'CLIENT' ? 'Client' : '';
          const tip = rol === 'CLIENT' ? secili('ClientType') : secili('CustomerType');
          const r = await (await fetch('/konut/kimlik?tip=' + tip + '&no=' + encodeURIComponent(deger(on + 'IdentityNumber')) + '&kod=' + encodeURIComponent(deger(on + 'TelefonKodu')) + '&tel=' + encodeURIComponent(deger(on + 'Telefonu')))).json();
          setTimeout(() => { const d = $(on + 'IdentityDetail'); d.querySelector('.ad').textContent = r.Status ? r.Data : 'Hata: ' + r.Data; d.hidden = false; }, 400);
        };
        $('RefreshUAVT').onclick = async () => {
          ortu(500);
          const r = await (await fetch('/konut/uavt?ak=' + encodeURIComponent(deger('AK')))).json();
          setTimeout(() => { $('DR').innerHTML = '<option value="-1">Seçiniz</option><option value="' + r.Data + '" selected>' + r.Data + '</option>'; }, 300);
        };
        let asama = 'bos';
        $('btnStandart').onclick = () => { setTimeout(() => { asama = 'sonraki'; $('TeklifHesaplaButon').textContent = 'Sonraki Adım'; $('TeklifHesaplaButon').hidden = false; }, 200); };
        const kimlikDurumu = (on) => ({ kod: deger(on + 'TelefonKodu'), tel: deger(on + 'Telefonu'),
          dogum: document.querySelector((on ? '#ettiren' : '#sigortali') + ' .dogum').hidden ? null : deger(on + 'BirthDate'),
          no: deger(on + 'IdentityNumber'), ad: $(on + 'IdentityDetail').hidden ? '' : $(on + 'IdentityDetail').querySelector('.ad').textContent });
        $('TeklifHesaplaButon').onclick = async () => {
          if (asama === 'sonraki') { setTimeout(() => { asama = 'teklif'; $('teminatlar').hidden = false; $('TeklifHesaplaButon').textContent = 'Teklif Hesapla'; }, 200); return; }
          if (asama !== 'teklif') return;
          const mal = secili('IsOwner') === 'E', farkli = secili('DifferentClient') === 'E';
          const govde = { tip: secili('CustomerType'), ...kimlikDurumu(''), farkli: secili('DifferentClient'),
            ettiren: farkli ? { tip: secili('ClientType'), ...kimlikDurumu('Client') } : null,
            ak: deger('AK'), dr: deger('DR'), baslangic: deger('BeginDate'), sahiplik: secili('IsOwner'), binaTipi: deger('BuildingType'),
            alan: mal ? deger('GrossAreaM2') : null, daskaBagli: mal ? secili('IsDASKDepended') : null, dainiMurtehin: secili('IsHaveLossPayee'),
            alternatifPlus: deger('AlternativePlus'), alternatif: deger('Alternative'), yapiTarzi: deger('ConstructionType'), toplamKat: deger('TotalFloor'),
            bulunduguKat: deger('RiskFloor'), catiTipi: deger('RoofType'), bos60: secili('BlankMoreThan60Days'), insaYili: deger('BuildYear'),
            teminat: { bina: mal ? deger('C1000') : null, esya: deger('C1008'), dekorasyon: deger('C1089'), cam: deger('C1036'),
              esyaDeprem: $('C1016').checked, dekorasyonDeprem: $('C1087').checked, hirsizlik: $('C1090').checked, sabitKiymet: $('C1092').checked,
              ferdiKaza: deger('PersonalAccidentLimit'), hukuksal: deger('LegalProtection'), enflasyon: deger('InflationRate') } };
          const r = await (await fetch('/jet-satis/jet-konut/teklif', { method: 'POST', body: JSON.stringify(govde) })).json();
          await new Promise((c) => setTimeout(c, 300));
          if (!r.Status) { $('hata-metni').textContent = r.Data; $('hata-penceresi').hidden = false; return; }
          $('prim').textContent = 'Prim ' + r.Data + ' ₺'; $('TeklifKaydetButon').hidden = false;
        };
        $('TeklifKaydetButon').onclick = () => { setTimeout(() => { $('fancybox-wrap').hidden = false; }, 150); };
        $('kart-baglantisi').onclick = (o) => { o.preventDefault(); $('fancybox-wrap').hidden = true; $('kart-formu').hidden = false; };
        $('odemeyi-tamamla').onclick = async (o) => {
          o.preventDefault();
          const govde = { isim: deger('isim'), soyisim: deger('soyisim'), kartNo: deger('kartno'), cvv: deger('cvv'), ay: deger('ay'), yil: deger('yil') };
          const r = await (await fetch('/konut/odeme', { method: 'POST', body: JSON.stringify(govde) })).json();
          setTimeout(() => alert(r.mesaj), 200);
        };
      </script>`);
  }
}
