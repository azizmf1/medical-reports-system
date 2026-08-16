// Fixed Examinee Section (system-owned). Injected as the FIRST section of every
// template; the Report Builder cannot remove, reorder, or edit it. Values are
// stored in dedicated columns on `reports` (indexed for inquiry performance).

export const NATIONALITIES = [
  { value: 'SA', label_en: 'Saudi Arabia', label_ar: 'المملكة العربية السعودية' },
  { value: 'EG', label_en: 'Egypt', label_ar: 'مصر' },
  { value: 'JO', label_en: 'Jordan', label_ar: 'الأردن' },
  { value: 'YE', label_en: 'Yemen', label_ar: 'اليمن' },
  { value: 'SD', label_en: 'Sudan', label_ar: 'السودان' },
  { value: 'IN', label_en: 'India', label_ar: 'الهند' },
  { value: 'PK', label_en: 'Pakistan', label_ar: 'باكستان' },
  { value: 'BD', label_en: 'Bangladesh', label_ar: 'بنغلاديش' },
  { value: 'PH', label_en: 'Philippines', label_ar: 'الفلبين' },
  { value: 'OTHER', label_en: 'Other', label_ar: 'أخرى' },
];

export const EXAMINEE_SECTION = {
  id: '__examinee__',
  system: true,
  title_en: 'Examinee Information',
  title_ar: 'بيانات المفحوص',
  fields: [
    {
      key: 'id_type', type: 'dropdown', required: true,
      label_en: 'ID Type', label_ar: 'نوع الهوية',
      options: [
        { value: 'national_id', label_en: 'National ID', label_ar: 'الهوية الوطنية' },
        { value: 'iqama', label_en: 'Iqama', label_ar: 'الإقامة' },
        { value: 'passport', label_en: 'Passport', label_ar: 'جواز السفر' },
      ],
    },
    { key: 'id_number', type: 'text', required: true, label_en: 'ID Number', label_ar: 'رقم الهوية', minLength: 5, maxLength: 20 },
    { key: 'full_name_en', type: 'text', required: true, label_en: 'Full Name (English)', label_ar: 'الاسم الكامل (إنجليزي)', maxLength: 120 },
    { key: 'full_name_ar', type: 'text', required: true, label_en: 'Full Name (Arabic)', label_ar: 'الاسم الكامل (عربي)', maxLength: 120 },
    { key: 'dob', type: 'date', required: true, label_en: 'Date of Birth', label_ar: 'تاريخ الميلاد' },
    {
      key: 'gender', type: 'radio', required: true, label_en: 'Gender', label_ar: 'الجنس',
      options: [
        { value: 'male', label_en: 'Male', label_ar: 'ذكر' },
        { value: 'female', label_en: 'Female', label_ar: 'أنثى' },
      ],
    },
    { key: 'nationality', type: 'dropdown', required: true, label_en: 'Nationality', label_ar: 'الجنسية', options: NATIONALITIES },
    { key: 'phone', type: 'text', required: false, label_en: 'Phone Number', label_ar: 'رقم الجوال', maxLength: 20 },
  ],
};

export function maskIdNumber(idNumber) {
  const s = String(idNumber || '');
  if (s.length <= 3) return '*'.repeat(s.length);
  return s[0] + '*'.repeat(s.length - 3) + s.slice(-2);
}
