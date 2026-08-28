import type { Place } from '../types';
import AddPlaceForm from './AddPlaceForm';

interface Props {
  editing: Place | null;
  onClose: () => void;
  onSaved: (place: Place) => void;
}

export default function PlaceFormModal({ editing, onClose, onSaved }: Props) {
  return (
    <div className="place-modal">
      <div className="place-modal__backdrop" onClick={onClose} />
      <div className="place-modal__sheet">
        <div className="place-modal__header">
          <span className="filter-sidebar__title">{editing ? 'Edit place' : 'Add a place'}</span>
          <button className="filter-sidebar__close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <AddPlaceForm editing={editing} onSaved={onSaved} />
      </div>
    </div>
  );
}
