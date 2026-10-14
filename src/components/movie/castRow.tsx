import type { Colors } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { imgUrl } from '@/lib/image';
import type { CastMember } from '@/types/movie';
import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

type CastRowProps = {
    title: string;
    cast: CastMember[];
    loading?: boolean;
};

const SKELETON_COUNT = 5;
const AVATAR = 76;

export default function CastRow({ title, cast, loading }: CastRowProps) {
    const router = useRouter();
    const { colors } = useTheme();
    const styles = createStyles(colors);

    if (!loading && cast.length === 0) return null;

    return (
        <View style={styles.section}>
            <Text style={styles.title}>{title}</Text>
            {loading ? (
                <View style={styles.skeletonRow}>
                    {Array.from({ length: SKELETON_COUNT }, (_, i) => (
                        <View key={i} style={styles.item}>
                            <View style={styles.avatar} />
                            <View style={styles.skeletonLine} />
                        </View>
                    ))}
                </View>
            ) : (
                <FlatList
                    horizontal
                    data={cast}

                    keyExtractor={(member) => String(member.person.ids.trakt)}
                    renderItem={({ item }) => {
                        const headshot = imgUrl(item.person.images?.headshot?.[0]);
                        return (
                            <Pressable
                            className="items-center me-2 max-w-[100px]"
                                onPress={() => router.push({ pathname: '/person/[slug]', params: { slug: item.person.ids.slug } })}
                                style={({ pressed }) => ({ ...styles.item, opacity: pressed ? 0.6 : 1 })}
                            >
                                <View style={styles.avatar}>
                                    {headshot ? (
                                        <Image source={{ uri: headshot }} style={styles.avatarImage} contentFit="cover" transition={200} />
                                    ) : (
                                        <Feather name="user" size={30} color={colors.textMuted} />
                                    )}
                                </View>
                                <Text numberOfLines={2} style={styles.name}>{item.person.name}</Text>
                                {!!item.character && (
                                    <Text numberOfLines={1} style={styles.character}>{item.character}</Text>
                                )}
                            </Pressable>
                        );
                    }}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: 16 }}
                />
            )}
        </View>
    );
}

const createStyles = (c: Colors) => StyleSheet.create({
    section: { marginBottom: 24 },
    title: { color: c.text, fontSize: 22, fontWeight: '700', marginHorizontal: 16, marginBottom: 12 },
    skeletonRow: { flexDirection: 'row', paddingHorizontal: 16, overflow: 'hidden' },
    item: { width: AVATAR + 8, marginRight: 12, alignItems: 'center' },
    avatar: {
        width: AVATAR,
        height: AVATAR,
        borderRadius: AVATAR / 2,
        overflow: 'hidden',
        backgroundColor: c.surface,
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarImage: { width: '100%', height: '100%' },
    name: { color: c.text, fontSize: 12, fontWeight: '600', marginTop: 6, textAlign: 'center' },
    character: { color: c.textMuted, fontSize: 11, marginTop: 2, textAlign: 'center' },
    skeletonLine: { width: 60, height: 10, borderRadius: 5, backgroundColor: c.surface, marginTop: 8 },
});
