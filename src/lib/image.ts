export const imgUrl = (path?: string | null) =>
    path ? (path.startsWith('http') ? path : `https://${path}`) : null;