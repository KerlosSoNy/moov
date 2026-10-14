import type { Colors } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/i18n/languageProvider';
import type { Platform } from '@/services/content/shoofAflam';
import Feather from '@expo/vector-icons/Feather';
import * as WebBrowser from 'expo-web-browser';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type WhereToWatchProps = {
    platforms: Platform[];
};

// Streaming services listing a title: a card of tappable rows with each
// service's brand color and mark. Layout lives on plain Views; Pressable is
// only the touch target.
export default function WhereToWatch({ platforms }: WhereToWatchProps) {
    const { t, language, isRTL } = useTranslation();
    const { colors } = useTheme();
    const styles = createStyles(colors);

    return (
        <View>
            <Text style={styles.heading}>{t('whereToWatch')}</Text>
            {platforms.length ? (
                <View style={styles.card}>
                    {platforms.map((platform, index) => {
                        const name = language === 'ar' ? platform.nameAr : platform.nameEn;
                        const mark = platform.logoText ?? name.slice(0, 2).toUpperCase();
                        return (
                            <Pressable
                                key={platform.id}
                                disabled={!platform.url}
                                onPress={() => platform.url && WebBrowser.openBrowserAsync(platform.url)}
                                accessibilityRole={platform.url ? 'link' : undefined}
                                accessibilityLabel={t('watchOn').replace('{name}', name)}
                            >
                                {({ pressed }) => (
                                    <View style={[styles.row, index > 0 && styles.divider, pressed && { backgroundColor: colors.fill }]}>
                                        <View style={[styles.badge, { backgroundColor: platform.color ?? colors.textMuted }]}>
                                            <Text style={styles.badgeText} numberOfLines={1} adjustsFontSizeToFit>{mark}</Text>
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.name} numberOfLines={1}>{name}</Text>
                                            <Text style={styles.hint}>{t('streamingPlatform')}</Text>
                                        </View>
                                        {platform.url && (
                                            <View style={styles.open}>
                                                <Text style={styles.openText}>{t('open')}</Text>
                                                <Feather name={isRTL ? 'arrow-up-left' : 'arrow-up-right'} size={14} color={colors.link} />
                                            </View>
                                        )}
                                    </View>
                                )}
                            </Pressable>
                        );
                    })}
                </View>
            ) : (
                <Text style={styles.muted}>{t('noPlatforms')}</Text>
            )}
            <Text style={styles.attribution}>{t('shoofAttribution')}</Text>
        </View>
    );
}

const createStyles = (c: Colors) => StyleSheet.create({
    heading: { color: c.text, fontSize: 18, fontWeight: '700', marginBottom: 10 },
    card: { backgroundColor: c.surface, borderRadius: 16, overflow: 'hidden' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
    divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
    badge: { width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
    badgeText: { color: '#fff', fontWeight: '900', fontSize: 14 },
    name: { color: c.text, fontSize: 16, fontWeight: '600' },
    hint: { color: c.textMuted, fontSize: 12, marginTop: 2 },
    open: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    openText: { color: c.link, fontWeight: '600' },
    muted: { color: c.textMuted, fontStyle: 'italic' },
    attribution: { color: c.textFaint, fontSize: 11, marginTop: 10 },
});
