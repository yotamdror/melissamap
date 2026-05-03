interface Props {
  date: string | null;
}

export default function LastUpdated({ date }: Props) {
  if (!date) return null;

  const formatted = new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return <div className="last-updated">Updated {formatted}</div>;
}
