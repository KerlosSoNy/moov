import { useTheme } from '@/hooks/useTheme'
import { Link } from 'expo-router'
import { Text, TouchableOpacity } from 'react-native'

export default function SingleTab({ text, link, icon }: { text?: string, link: any, icon?: any }) {
    const { colors } = useTheme()
    return (
        <Link href={link || ''} asChild>
            <TouchableOpacity className="h-[90%] my-auto items-center justify-center  rounded-full px-2">
                {icon && icon}
                {text && <Text style={{ color: colors.text }}>{text}</Text>}
            </TouchableOpacity>
        </Link>
    )
}
