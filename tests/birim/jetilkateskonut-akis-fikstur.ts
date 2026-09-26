// YEREL FİKSTÜR — Jet İlk Ateş Konut benzeri teklif ekranı (girişsiz; 127.0.0.1). "JetİlkAteşKonut (akış)" paketinin
// (projeler/galaksi/jetilkateskonut-akis.mjs) model koşucusuyla uçtan uca denenmesi içindir. Seçiciler ve davranış POM'dakilerle
// aynıdır: "Sigortalı Bilgileri" başlığı, özel çizimli radyolar, telefon kodu + numarası, tipe göre görünen doğum tarihi,
// "CheckIdentity('INSURED' / 'CLIENT')" sorgu bağlantıları ve sonuçla görünen detay kutuları, farklı sigorta ettiren, UAVT
// adres sorgusu (#IL ve #DR "-1"den çıkar; yükleme örtüsü), alternatif (GİZLİ, jqTransform; seçilince eşya yangın / ek
// teminat bedelleri dolar), yapı tarzı (bu fikstürde görünür <select> — seçicinin ikinci yolu), "Standart" → sayfada
// "Prim … ₺" ya da hata penceresi (.modal), id'siz "Teklif Kaydet" düğmesi ve kredi kartı ödemesi.
// Şirket sitesine hiçbir istek gitmez.
import type { FiksturIstegi, FiksturUygulamasi, FiksturYaniti } from './giris-fikstur';

export const FIRE_YOLU = '/jet-satis/jet-fire/';
export const FIRE_ODEME_SONUCU = 'Hiçbir poliçe onaylanamadı.';
/** Sunucunun iş kuralı uyarısı (inşa yılı 1950'den önceyse). */
export const FIRE_INSA_YILI_UYARISI = 'Teklif oluşturulamadı: bina inşa yılı 1950 öncesi olamaz.';
/** Alternatif seçenekleri ve seçilince dolan [eşya yangın, ek teminat] bedelleri (fikstürün). */
export const FIRE_ALTERNATIFLERI: Array<[string, string, string, string]> = [
  ['1', 'Ekonomik Paket', '50000', '10000'],
  ['2', 'Geniş Paket', '100000', '25000']
];
export const FIRE_YAPI_TARZLARI: Array<[string, string]> = [['1', 'Betonarme Karkas'], ['2', 'Yığma Kagir']];

export type FireTeklifi = Record<string, unknown>;

const html = (govde: string): FiksturYaniti => ({
  tur: 'text/html; charset=utf-8',
  govde: `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Jet İlk Ateş</title>
<style>[hidden]{display:none!important}body{font:14px system-ui;margin:24px}label{display:block;margin:6px 0}.radyo{position:relative;display:inline-block;margin-right:12px}
.radyo input{position:absolute;opacity:0;width:14px;height:14px;margin:0}.radyo span{padding-left:18px}
.jqTransformSelectWrapper{display:inline-block;margin:4px 12px 4px 0}.jqTransformSelectOpen{padding:0 6px}.jqTransformHidden{display:none}
.blockUI.blockOverlay{position:fixed;inset:0;background:rgba(0,0,0,.2)}</style></head><body>${govde}</body></html>`
});
const json = (veri: unknown): FiksturYaniti => ({ tur: 'application/json', govde: JSON.stringify(veri) });

export class FireUygulamasi {
  readonly teklifler: FireTeklifi[] = [];
  readonly odemeler: Array<Record<string, unknown>> = [];
  readonly olaylar: string[] = [];

  readonly isle: FiksturUygulamasi = (i: FiksturIstegi) => {
    this.olaylar.push(`${i.yontem} ${i.yol}`);
    if (i.yol === FIRE_YOLU || i.yol === FIRE_YOLU.slice(0, -1)) return this.sayfa();
    if (i.yol === '/fire/kimlik') {
      const no = i.sorgu.get('no') ?? '';
      if (!no || !i.sorgu.get('kod') || !i.sorgu.get('tel')) return json({ Status: false, Data: 'Telefon ve kimlik no zorunludur.' });
      return json({ Status: true, Data: i.sorgu.get('tip') === 'T' ? `UNVAN ${no.slice(-3)} A.Ş.` : `KİŞİ ${no.slice(-3)}` });
    }
    if (i.yol === '/fire/uavt') return json({ Status: true, Data: { il: '34', dr: `D${(i.sorgu.get('ak') ?? '').slice(-3)}` } });
    if (i.yol === '/fire/odeme' && i.yontem === 'POST') {
      this.odemeler.push(JSON.parse(i.govde || '{}') as Record<string, unknown>);
      return json({ mesaj: FIRE_ODEME_SONUCU });
    }
    if (i.yol === '/jet-satis/jet-fire/teklif' && i.yontem === 'POST') {
      const g = JSON.parse(i.govde || '{}') as Record<string, unknown>;
      this.teklifler.push(g);
      if (Number(g.insaYili) < 1950) return json({ Status: false, Data: FIRE_INSA_YILI_UYARISI });
      if (!g.ad || !g.dr || g.dr === '-1' || g.il === '-1') return json({ Status: false, Data: 'Eksik bilgi.' });
      return json({ Status: true, Data: '987,65' });
    }
    return { durum: 404, tur: 'text/plain', govde: 'yok' };
  };

  private sayfa(): FiksturYaniti {
    const radyo = (ad: string, deger: string, metin: string, secili = false) =>
      `<label class="radyo"><input type="radio" name="${ad}" id="${ad}-${deger}" value="${deger}"${secili ? ' checked' : ''}><span>${metin}</span><a href="#"></a></label>`;
    const kimlik = (on: string, baslik: string, rol: string) => `
        <label>Telefon kodu <input id="${on}TelefonKodu"></label><label>Telefon <input id="${on}Telefonu"></label>
        <label class="dogum">Doğum tarihi <input id="${on}BirthDate"></label>
        <label>Kimlik no <input id="${on}IdentityNumber"></label>
        <a href="javascript:CheckIdentity('${rol}')">Sorgula</a>
        <div id="${on}IdentityDetail" hidden><b>${baslik}</b> <span class="ad"></span></div>`;
    return html(`<h1>Jet İlk Ateş Konut</h1>
      <section id="sigortali"><h2>Sigortalı Bilgileri</h2>
        ${radyo('CustomerType', 'O', 'Özel', true)}${radyo('CustomerType', 'T', 'Tüzel')}${kimlik('', 'Sigortalı', 'INSURED')}
      </section>
      <section><h2>Sigorta Ettiren</h2>${radyo('DifferentClient', 'H', 'Aynı')}${radyo('DifferentClient', 'E', 'Farklı')}
        <div id="ettiren" hidden>${radyo('ClientType', 'O', 'Özel ettiren', true)}${radyo('ClientType', 'T', 'Tüzel ettiren')}${kimlik('Client', 'Sigorta Ettiren', 'CLIENT')}</div>
      </section>
      <section><h2>Adres ve poliçe</h2>
        <label>Adres kodu <input id="AK"></label><button id="RefreshUAVT" type="button">Adres sorgula</button>
        <label>İl <select id="IL"><option value="-1">Seçiniz</option></select></label>
        <label>Adres <select id="DR"><option value="-1">Seçiniz</option></select></label>
        <label>Başlangıç <input id="BeginDate" readonly></label>
        ${radyo('IsOwner', 'E', 'Mal sahibi')}${radyo('IsOwner', 'H', 'Kiracı')}
        <label>Alternatif</label><div class="jqTransformSelectWrapper"><div><span>Seçiniz</span><a href="#" class="jqTransformSelectOpen">▼</a></div><ul hidden></ul>
          <select id="Alternative" class="jqTransformHidden"><option value="">Seçiniz</option>${FIRE_ALTERNATIFLERI.map(([d, m]) => `<option value="${d}">${m}</option>`).join('')}</select></div>
        <label>Eşya yangın <input id="EsyaYangin" readonly></label><label>Ek teminatlar <input id="EkTeminatlar" readonly></label>
        <label>Yapı tarzı <select id="ConstructionType"><option value="">Seçiniz</option>${FIRE_YAPI_TARZLARI.map(([d, m]) => `<option value="${d}">${m}</option>`).join('')}</select></label>
        <label>İnşa yılı <input id="BuildYear"></label>
      </section>
      <button id="btnStandart" type="button">Standart</button>
      <p id="sonuc"></p>
      <input type="button" value="Teklif Kaydet" id="kaydet" hidden>
      <div class="modal" id="hata" hidden></div>
      <div id="fancybox-wrap" hidden><a href="#" id="kart-baglantisi">KREDİ KARTI İLE POLİÇELEŞTİR</a></div>
      <div id="kart-formu" hidden>
        <label>Kart üzerindeki isim <input id="isim"></label><label>Kart üzerindeki soyisim <input id="soyisim"></label>
        <label>Kart numarası <input id="kartno"></label><label>Güvenlik kodu (CVV) <input id="cvv"></label>
        <label>Ay <select id="ay">${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${String(i + 1).padStart(2, '0')}</option>`).join('')}</select></label>
        <label>Yıl <select id="yil">${Array.from({ length: 11 }, (_, i) => `<option value="${2026 + i}">${2026 + i}</option>`).join('')}</select></label>
        <a href="#" id="odemeyi-tamamla">Ödemeyi tamamla</a>
      </div>
      <script>
        const ALTERNATIFLER = ${JSON.stringify(FIRE_ALTERNATIFLERI)};
        const $ = (id) => document.getElementById(id);
        const secili = (ad) => { const r = document.querySelector('input[name=' + ad + ']:checked'); return r ? r.value : null; };
        const deger = (id) => $(id).value;
        const ortu = (ms) => { const o = document.createElement('div'); o.className = 'blockUI blockOverlay'; document.body.appendChild(o); setTimeout(() => o.remove(), ms); };
        const gorunurluk = () => {
          document.querySelector('#sigortali .dogum').hidden = secili('CustomerType') === 'T';
          $('ettiren').hidden = secili('DifferentClient') !== 'E';
          document.querySelector('#ettiren .dogum').hidden = secili('ClientType') === 'T';
        };
        document.querySelectorAll('input[type=radio]').forEach((r) => r.addEventListener('change', gorunurluk));
        gorunurluk();
        const w = document.querySelector('.jqTransformSelectWrapper');
        const listeyiCiz = () => {
          const s = w.querySelector('select');
          w.querySelector('ul').innerHTML = Array.from(s.options).map((o, i) => '<li><a href="#" index="' + i + '">' + o.text + '</a></li>').join('');
          w.querySelector('span').textContent = s.options[s.selectedIndex].text;
        };
        listeyiCiz();
        w.querySelector('.jqTransformSelectOpen').onclick = (o) => { o.preventDefault(); w.querySelector('ul').hidden = !w.querySelector('ul').hidden; };
        w.querySelector('ul').addEventListener('click', (o) => {
          const a = o.target.closest('a'); if (!a) return; o.preventDefault();
          const s = w.querySelector('select'); s.selectedIndex = Number(a.getAttribute('index'));
          w.querySelector('ul').hidden = true; listeyiCiz(); s.dispatchEvent(new Event('change', { bubbles: true }));
        });
        // Alternatif seçilince bedeller dolar (POM bunları test verisiyle karşılaştırıyordu).
        $('Alternative').addEventListener('change', () => {
          const a = ALTERNATIFLER.find((x) => x[0] === deger('Alternative'));
          $('EsyaYangin').value = a ? a[2] : ''; $('EkTeminatlar').value = a ? a[3] : '';
        });
        window.CheckIdentity = (rol) => { void kimlikSorgula(rol); };
        const kimlikSorgula = async (rol) => {
          const on = rol === 'CLIENT' ? 'Client' : '';
          const tip = rol === 'CLIENT' ? secili('ClientType') : secili('CustomerType');
          const r = await (await fetch('/fire/kimlik?tip=' + tip + '&no=' + encodeURIComponent(deger(on + 'IdentityNumber')) + '&kod=' + encodeURIComponent(deger(on + 'TelefonKodu')) + '&tel=' + encodeURIComponent(deger(on + 'Telefonu')))).json();
          setTimeout(() => { const d = $(on + 'IdentityDetail'); d.querySelector('.ad').textContent = r.Status ? r.Data : 'Hata: ' + r.Data; d.hidden = false; }, 400);
        };
        // UAVT: önce il, biraz sonra adres dolar (koşucu adresi bekler).
        $('RefreshUAVT').onclick = async () => {
          ortu(600);
          const r = await (await fetch('/fire/uavt?ak=' + encodeURIComponent(deger('AK')))).json();
          setTimeout(() => { $('IL').innerHTML = '<option value="-1">Seçiniz</option><option value="' + r.Data.il + '" selected>İstanbul</option>'; }, 150);
          setTimeout(() => { $('DR').innerHTML = '<option value="-1">Seçiniz</option><option value="' + r.Data.dr + '" selected>' + r.Data.dr + '</option>'; }, 350);
        };
        const kimlikDurumu = (on) => ({ kod: deger(on + 'TelefonKodu'), tel: deger(on + 'Telefonu'),
          dogum: document.querySelector((on ? '#ettiren' : '#sigortali') + ' .dogum').hidden ? null : deger(on + 'BirthDate'),
          no: deger(on + 'IdentityNumber'), ad: $(on + 'IdentityDetail').hidden ? '' : $(on + 'IdentityDetail').querySelector('.ad').textContent });
        $('btnStandart').onclick = async () => {
          const farkli = secili('DifferentClient') === 'E';
          const govde = { tip: secili('CustomerType'), ...kimlikDurumu(''), farkli: secili('DifferentClient'),
            ettiren: farkli ? { tip: secili('ClientType'), ...kimlikDurumu('Client') } : null,
            ak: deger('AK'), il: deger('IL'), dr: deger('DR'), baslangic: deger('BeginDate'), sahiplik: secili('IsOwner'),
            alternatif: deger('Alternative'), esyaYangin: deger('EsyaYangin'), ekTeminat: deger('EkTeminatlar'),
            yapiTarzi: deger('ConstructionType'), insaYili: deger('BuildYear') };
          const r = await (await fetch('/jet-satis/jet-fire/teklif', { method: 'POST', body: JSON.stringify(govde) })).json();
          await new Promise((c) => setTimeout(c, 300));
          if (!r.Status) { $('hata').textContent = r.Data; $('hata').hidden = false; return; }
          $('sonuc').textContent = 'Prim ' + r.Data + ' ₺'; $('kaydet').hidden = false;
        };
        $('kaydet').onclick = () => { setTimeout(() => { $('fancybox-wrap').hidden = false; }, 150); };
        $('kart-baglantisi').onclick = (o) => { o.preventDefault(); $('fancybox-wrap').hidden = true; $('kart-formu').hidden = false; };
        $('odemeyi-tamamla').onclick = async (o) => {
          o.preventDefault();
          const govde = { isim: deger('isim'), soyisim: deger('soyisim'), kartNo: deger('kartno'), cvv: deger('cvv'), ay: deger('ay'), yil: deger('yil') };
          const r = await (await fetch('/fire/odeme', { method: 'POST', body: JSON.stringify(govde) })).json();
          setTimeout(() => alert(r.mesaj), 200);
        };
      </script>`);
  }
}
