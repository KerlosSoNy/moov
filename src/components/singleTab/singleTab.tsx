import { Link } from 'expo-router'
import { Text, TouchableOpacity } from 'react-native'

export default function SingleTab({ text, link, icon }: { text?: string, link: any, icon?: any }) {
    return (
        <Link href={link || ''} asChild>
            <TouchableOpacity className="h-[90%] my-auto items-center justify-center  rounded-full px-2">
                {icon && icon}
                {text && <Text className="text-white">{text}</Text>}
            </TouchableOpacity>
        </Link>
    )
}
