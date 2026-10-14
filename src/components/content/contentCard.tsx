import FavoriteButton from '@/components/favoriteButton/favoriteButton';
import { ON_IMAGE } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/i18n/languageProvider';
import { contentHref, toFavoriteMovie } from '@/lib/contentRoutes';
import { displayTitle, type ContentItem } from '@/types/content';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';

const fallback = require('../../../assets/image/loading.png');

type ContentCardProps = {
    item: ContentItem;
    // Grid screens size cards to their column; rows use the default width
    width?: number;
    style?: StyleProp<ViewStyle>;
};

export default function ContentCard({ item, width = 140, style }: ContentCardProps) {
    const router = useRouter();
    const { colors } = useTheme();
    const { t, language } = useTranslation();
    const favorite = toFavoriteMovie(item);
    const title = displayTitle(item, language);

    return (
        <Pressable
            onPress={() => router.push(contentHref(item))}
            accessibilityRole="button"
            accessibilityLabel={title}
            style={[{ width, marginEnd: 14 }, style]}
        >
            <View style={{ width, height: width * 1.5, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.surface }}>
                <Image
                    source={item.poster ? { uri: item.poster } : fallback}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="cover"
                    transition={200}
                    recyclingKey={item.key}
                />
                {item.rating !== null && (
                    <View style={{ position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ color: ON_IMAGE.rating, fontSize: 12, fontWeight: '700' }}>★ {item.rating.toFixed(1)}</Text>
                    </View>
                )}
                {item.type === 'series' && (
                    <View style={{ position: 'absolute', bottom: 8, left: 8, backgroundColor: ON_IMAGE.scrim, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ color: ON_IMAGE.text, fontSize: 11, fontWeight: '700' }}>{t('seriesBadge')}</Text>
                    </View>
                )}
                {favorite && (
                    <FavoriteButton movie={favorite} variant="image" size={14} style={{ position: 'absolute', top: 6, left: 6 }} />
                )}
            </View>
            <Text numberOfLines={1} style={{ color: colors.text, fontWeight: '600', marginTop: 8 }}>{title}</Text>
            {item.year !== null && <Text style={{ color: colors.textMuted, fontSize: 12 }}>{item.year}</Text>}
        </Pressable>
    );
}
