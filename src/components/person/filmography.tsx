import type { Colors } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/i18n/languageProvider';
import { imgUrl } from '@/lib/image';
import type { Credit } from '@/services/person/person';
import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

const fallback = require('../../../assets/image/loading.png');

// Trakt department keys with a translated label; unknown keys fall back to the raw name
const DEPARTMENTS: any = {
    acting: 'deptActing',
    directing: 'deptDirecting',
    writing: 'deptWriting',
    production: 'deptProduction',
    camera: 'deptCamera',
    editing: 'deptEditing',
    sound: 'deptSound',
    art: 'deptArt',
    'costume & make-up': 'deptCostume',
    'visual effects': 'deptVisualEffects',
    lighting: 'deptLighting',
    crew: 'deptCrew',
};
const ORDER = Object.keys(DEPARTMENTS);
const PAGE_SIZE = 15;

type FilmographyProps = {
    filmography: Record<string, Credit[]>;
    // Tab selected first, e.g. the person's known_for_department
    initialDepartment?: string | null;
};

export default function Filmography({ filmography, initialDepartment }: FilmographyProps) {
    const router = useRouter();
    const { t } :any= useTranslation();
    const { colors } = useTheme();
    const styles = createStyles(colors);

    const departments = Object.keys(filmography).sort(
        (a, b) => (ORDER.indexOf(a) + 1 || Infinity) - (ORDER.indexOf(b) + 1 || Infinity),
    );
    const [selected, setSelected] = useState(
        initialDepartment && filmography[initialDepartment] ? initialDepartment : departments[0],
    );
    const [visible, setVisible] = useState(PAGE_SIZE);

    if (!departments.length || !selected) return null;

    const credits = filmography[selected] ?? [];
    const label = (department: string) =>
        DEPARTMENTS[department] ? t(DEPARTMENTS[department]) : department;

    return (
        <View style={styles.section}>
            <Text style={styles.title}>{t('filmography')}</Text>

            {departments.length > 1 && (
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.tabs}
                >
                    {departments.map((department) => {
                        const active = department === selected;
                        return (
                            <Pressable
                                key={department}
                                onPress={() => {
                                    setSelected(department);
                                    setVisible(PAGE_SIZE);
                                }}
                            >
                                {/* Styles returned from Pressable's style callback are dropped in this app,
                                    so layout lives on an inner View driven by the pressed state */}
                                {({ pressed }) => (
                                    <View
                                        className="items-center"
                                        style={{
                                            ...styles.tab,
                                            backgroundColor: active ? colors.accent : pressed ? colors.fillPressed : colors.surface,
                                            borderColor: active ? colors.accent : colors.border,
                                        }}
                                    >
                                        <Text style={{ ...styles.tabText, color: active ? '#fff' : colors.text }}>
                                            {label(department)}
                                        </Text>
                                        <View style={{ ...styles.tabCount, backgroundColor: active ? 'rgba(255,255,255,0.25)' : colors.fill }}>
                                            <Text style={{ ...styles.tabCountText, color: active ? '#fff' : colors.textMuted }}>
                                                {filmography[department].length}
                                            </Text>
                                        </View>
                                    </View>
                                )}
                            </Pressable>
                        );
                    })}
                </ScrollView>
            )}

            <View style={styles.list}>
                {credits.slice(0, visible).map(({ movie, roles }, index) => {
                    const poster = imgUrl(movie.images?.poster?.[0]);
                    return (
                        <Pressable
                            key={movie.ids.trakt}
                            onPress={() => router.push({ pathname: '/movie/[slug]', params: { slug: movie.ids.slug } })}
                        >
                            {({ pressed }) => (
                                <View
                                    style={{
                                        ...styles.item,
                                        ...(index > 0 ? styles.itemDivider : null),
                                        backgroundColor: pressed ? colors.surfacePressed : 'transparent',
                                    }}
                                >
                                    <Image source={poster ? { uri: poster } : fallback} style={styles.poster} contentFit="cover" transition={200} />
                                    <View style={styles.info}>
                                        <Text numberOfLines={2} style={styles.movieTitle}>{movie.title}</Text>
                                        {roles.length > 0 && (
                                            <Text numberOfLines={1} style={styles.role}>{roles.join(', ')}</Text>
                                        )}
                                        <View style={styles.metaRow}>
                                            <Text style={styles.year}>{movie.year ?? t('comingSoon')}</Text>
                                            {!!movie.rating && (
                                                <Text style={styles.rating}>★ {movie.rating.toFixed(1)}</Text>
                                            )}
                                        </View>
                                    </View>
                                    <Feather name="chevron-right" size={18} color={colors.textFaint} />
                                </View>
                            )}
                        </Pressable>
                    );
                })}
            </View>

            {credits.length > PAGE_SIZE && (
                <Pressable
                    onPress={() => setVisible(visible >= credits.length ? PAGE_SIZE : visible + PAGE_SIZE)}
                    hitSlop={8}
                    style={{ alignSelf: 'center' }}
                >
                    {({ pressed }) => (
                        <View style={{ ...styles.more, backgroundColor: pressed ? colors.fillPressed : colors.fill }}>
                            <Text style={styles.moreText}>
                                {visible >= credits.length ? t('showLess') : `${t('showMore')} (${credits.length - visible})`}
                            </Text>
                        </View>
                    )}
                </Pressable>
            )}
        </View>
    );
}

const createStyles = (c: Colors) => StyleSheet.create({
    section: { marginBottom: 24 },
    title: { color: c.text, fontSize: 22, fontWeight: '700', marginHorizontal: 16, marginBottom: 12 },
    tabs: { paddingHorizontal: 16, gap: 8, marginBottom: 14 },
    tab: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        borderRadius: 18,
        borderWidth: StyleSheet.hairlineWidth,
        paddingLeft: 14,
        paddingRight: 6,
        height: 36,
    },
    tabText: { fontSize: 14, fontWeight: '600' },
    tabCount: { minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
    tabCountText: { fontSize: 12, fontWeight: '700' },
    list: { marginHorizontal: 16, backgroundColor: c.surface, borderRadius: 16, overflow: 'hidden' },
    item: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 12 },
    itemDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
    poster: { width: 54, height: 81, borderRadius: 8, backgroundColor: c.fill },
    info: { flex: 1, gap: 3 },
    movieTitle: { color: c.text, fontSize: 15, fontWeight: '600' },
    role: { color: c.textSecondary, fontSize: 13 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
    year: { color: c.textMuted, fontSize: 13 },
    rating: { color: c.rating, fontSize: 13, fontWeight: '700' },
    more: { alignSelf: 'center', marginTop: 14, borderRadius: 18, paddingHorizontal: 18, paddingVertical: 9 },
    moreText: { color: c.text, fontWeight: '600' },
});
