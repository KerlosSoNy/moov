import ContentCard from '@/components/content/contentCard';
import SearchBar from '@/components/search/searchBar';
import SearchMessage from '@/components/search/searchMessage';
import type { Colors } from '@/constants/theme';
import { useAsync } from '@/hooks/useAsync';
import { useBrowse } from '@/hooks/useBrowse';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/i18n/languageProvider';
import { CATEGORIES, categoryGenres, isCategoryId, type BrowseSort, type CategoryId } from '@/services/content/catalog';
import Feather from '@expo/vector-icons/Feather';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Keyboard, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const COLUMNS = 3;
const GAP = 12;
const GUTTER = 16;
const TAB_BAR_SPACE = 120;

const SORT_LABELS: any = {
    featured: 'sortFeatured',
    newest: 'sortNewest',
    rating: 'sortRating',
    title: 'sortTitle',
    popular: 'popular',
    trending: 'trending',
};

export default function BrowseScreen() {
    const { category, sort } = useLocalSearchParams<{ category: string; sort?: string }>();
    if (!isCategoryId(category)) return <Redirect href="/home" />;
    const initialSort = CATEGORIES[category].sorts.find((s) => s === sort);
    return <Browse key={category} category={category} initialSort={initialSort} />;
}

function Browse({ category, initialSort }: { category: CategoryId; initialSort?: BrowseSort }) {
    const { t, language }:any = useTranslation();
    const { colors } = useTheme();
    const router = useRouter();
    const { width } = useWindowDimensions();
    const styles = createStyles(colors);
    const config = CATEGORIES[category];

    const [query, setQuery] = useState('');
    const [genre, setGenre] = useState<string | null>(null);
    const [sort, setSort] = useState<BrowseSort>(initialSort ?? config.sorts[0]);
    const browse = useBrowse(category, { query, genre, sort });
    const genres = useAsync(() => categoryGenres(category), `genres:${category}`);
    const searching = query.trim().length > 0;

    const cardWidth = Math.floor((width - GUTTER * 2 - GAP * (COLUMNS - 1)) / COLUMNS);

    const renderBody = () => {
        if (browse.status === 'loading' && !browse.items.length) {
            return <View style={styles.center}><ActivityIndicator color={colors.text} /></View>;
        }
        if (browse.status === 'error' && !browse.items.length) {
            return <SearchMessage icon="alert-circle" message={t('searchError')} actionLabel={t('retry')} onAction={browse.retry} />;
        }
        if (!browse.items.length) {
            return <SearchMessage icon="search" message={t('browseEmpty')} />;
        }
        return (
            <FlatList
                data={browse.items}
                keyExtractor={(item) => item.key}
                numColumns={COLUMNS}
                renderItem={({ item }) => <ContentCard item={item} width={cardWidth} style={{ marginEnd: 0 }} />}
                columnWrapperStyle={{ gap: GAP }}
                contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: TAB_BAR_SPACE, gap: 18 }}
                onEndReached={browse.loadMore}
                onEndReachedThreshold={0.6}
                keyboardShouldPersistTaps="handled"
                onScrollBeginDrag={Keyboard.dismiss}
                ListFooterComponent={
                    browse.status === 'loadingMore' ? (
                        <ActivityIndicator color={colors.text} style={{ marginVertical: 16 }} />
                    ) : browse.status === 'error' ? (
                        <Pressable onPress={browse.retry} style={styles.footerRetry}>
                            <Text style={{ color: colors.link, fontWeight: '600' }}>{t('retry')}</Text>
                        </Pressable>
                    ) : null
                }
            />
        );
    };

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <View style={styles.header}>
                <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('back')} style={styles.back}>
                    <Feather name={language === 'ar' ? 'chevron-right' : 'chevron-left'} size={24} color={colors.text} />
                </Pressable>
                <Text style={styles.title} numberOfLines={1}>{t(config.title)}</Text>
            </View>
            <View style={{ paddingHorizontal: GUTTER, gap: 10, paddingBottom: 12 }}>
                <SearchBar value={query} onChangeText={setQuery} onClear={() => setQuery('')} placeholder={t('browseSearchPlaceholder')} />
                {/* Trakt search ranks by relevance, so its sort options only apply to browsing */}
                {!(searching && config.source === 'trakt') && (
                    <Chips
                        options={config.sorts.map((value) => ({ value, label: t(SORT_LABELS[value]) }))}
                        value={sort}
                        onChange={(value) => value && setSort(value)}
                        colors={colors}
                    />
                )}
                {!!genres.data?.length && (
                    <Chips
                        options={genres.data.map((value) => ({ value, label: value.replace(/-/g, ' ') }))}
                        value={genre}
                        allLabel={t('allGenres')}
                        onChange={setGenre}
                        colors={colors}
                    />
                )}
            </View>
            {renderBody()}
            {config.source === 'shoofaflam' && <Text style={styles.attribution}>{t('shoofAttribution')}</Text>}
        </SafeAreaView>
    );
}

type ChipsProps<T extends string> = {
    options: { value: T; label: string }[];
    value: T | null;
    onChange: (value: T | null) => void;
    // Adds a leading chip that clears the selection
    allLabel?: string;
    colors: Colors;
};

function Chips<T extends string>({ options, value, onChange, allLabel, colors }: ChipsProps<T>) {
    const all = allLabel ? [{ value: null, label: allLabel }, ...options] : options;
    return (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
            {all.map((option) => {
                const selected = option.value === value;
                return (
                    <Pressable
                        key={option.value ?? '__all'}
                        onPress={() => onChange(option.value)}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                    >
                        {({ pressed }) => (
                            <View
                                style={{
                                    paddingHorizontal: 14,
                                    paddingVertical: 7,
                                    borderRadius: 16,
                                    backgroundColor: selected ? colors.text : pressed ? colors.fillPressed : colors.fill,
                                }}
                            >
                                <Text style={{ color: selected ? colors.background : colors.text, fontSize: 13, fontWeight: '600', textTransform: 'capitalize' }}>
                                    {option.label}
                                </Text>
                            </View>
                        )}
                    </Pressable>
                );
            })}
        </ScrollView>
    );
}

const createStyles = (c: Colors) => StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12 },
    back: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    title: { color: c.text, fontSize: 26, fontWeight: '700', flexShrink: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    footerRetry: { alignItems: 'center', paddingVertical: 16 },
    attribution: { position: 'absolute', bottom: 8, alignSelf: 'center', color: c.textFaint, fontSize: 10 },
});
