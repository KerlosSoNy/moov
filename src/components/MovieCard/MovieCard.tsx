import { ON_IMAGE } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { imgUrl } from '@/lib/image';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import type { Movie } from '@/types/movie';
import { Pressable, Text, View } from 'react-native';

const fallback = require('../../../assets/image/loading.png');

export default function MovieCard({ movie }: { movie: Movie }) {
    const router = useRouter();
    const { colors } = useTheme();
    const poster = imgUrl(movie?.images?.poster?.[0]);

    return (
        <Pressable
            onPress={() => router.push({ pathname: '/movie/[slug]', params: { slug: movie.ids.slug } })}
            style={{ width: 140, marginRight: 14 }}
        >
            <View style={{ width: 140, height: 210, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.surface }}>
                <Image
                    source={poster ? { uri: poster } : fallback}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="cover"
                    transition={200}
                />
                {!!movie.rating && (
                    <View style={{ position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ color: ON_IMAGE.rating, fontSize: 12, fontWeight: '700' }}>★ {movie.rating.toFixed(1)}</Text>
                    </View>
                )}
            </View>
            <Text numberOfLines={1} style={{ color: colors.text, fontWeight: '600', marginTop: 8 }}>{movie.title}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>{movie.year}</Text>
        </Pressable>
    );
}