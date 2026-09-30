// ADRESE GİT YOLU (genel, saf) — kayıtta görülen adres değişiminin (giriş kaydı ve ekran akışı kaydı) ve ekran modelindeki
// "git" aksiyonunun ortak kuralı. Yol YALNIZ aynı ortamın kökenine göredir: "/" ile başlar; tam adres, başka site, "//…" olmaz.
// Parça ("#") atılır, yalnız yol gibi görünen parça ("#/rota", "#!/rota") korunur (parçayla yönlenen tek sayfa uygulamaları).
// Sorgu dizisi kısa ve gizli değer çağrıştıran parametre (jeton, oturum, parola…) içermiyorsa korunur; aksi hâlde atılır.
// NOT: import.meta KULLANILMAZ. Tipler: gezinme-yolu.d.mts.

import { GEZINME_YOLU_EN_COK, GEZINME_SORGU_EN_COK, gezinmeYolu, gitYoluHatasi } from './ekran-modeli-dogrulayici.mjs';

export { GEZINME_YOLU_EN_COK, GEZINME_SORGU_EN_COK, gezinmeYolu, gitYoluHatasi };
