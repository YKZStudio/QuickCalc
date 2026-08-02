#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum Locale {
    ZhCn,
    ZhTw,
    #[default]
    EnUs,
}

impl Locale {
    pub fn system() -> Self {
        sys_locale::get_locale()
            .as_deref()
            .map(Self::from_language_tag)
            .unwrap_or_default()
    }

    pub fn from_language_tag(language: &str) -> Self {
        let normalized = language.trim().replace('_', "-").to_ascii_lowercase();
        if normalized == "zh-tw"
            || normalized.starts_with("zh-tw-")
            || normalized == "zh-hk"
            || normalized.starts_with("zh-hk-")
            || normalized == "zh-mo"
            || normalized.starts_with("zh-mo-")
            || normalized.contains("hant")
        {
            Self::ZhTw
        } else if normalized == "zh"
            || normalized == "zh-cn"
            || normalized.starts_with("zh-cn-")
            || normalized == "zh-sg"
            || normalized.starts_with("zh-sg-")
            || normalized.contains("hans")
        {
            Self::ZhCn
        } else {
            Self::EnUs
        }
    }

    pub fn text<'a>(self, zh_cn: &'a str, zh_tw: &'a str, en_us: &'a str) -> &'a str {
        match self {
            Self::ZhCn => zh_cn,
            Self::ZhTw => zh_tw,
            Self::EnUs => en_us,
        }
    }
}

macro_rules! tr {
    ($locale:expr; $zh_cn:expr, $zh_tw:expr, $en_us:expr $(,)?) => {
        match $locale {
            $crate::i18n::Locale::ZhCn => $zh_cn,
            $crate::i18n::Locale::ZhTw => $zh_tw,
            $crate::i18n::Locale::EnUs => $en_us,
        }
    };
}

pub(crate) use tr;

#[cfg(test)]
mod tests {
    use super::Locale;

    #[test]
    fn resolves_supported_chinese_locales() {
        for language in ["zh", "zh-CN", "zh_SG", "zh-Hans-CN"] {
            assert_eq!(Locale::from_language_tag(language), Locale::ZhCn);
        }
        for language in ["zh-TW", "zh_HK", "zh-MO", "zh-Hant-TW"] {
            assert_eq!(Locale::from_language_tag(language), Locale::ZhTw);
        }
    }

    #[test]
    fn falls_back_to_american_english() {
        for language in ["en-US", "en-GB", "fr-FR", "ja-JP", ""] {
            assert_eq!(Locale::from_language_tag(language), Locale::EnUs);
        }
    }
}
