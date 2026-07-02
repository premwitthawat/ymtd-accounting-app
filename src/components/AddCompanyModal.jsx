import { Plus } from "lucide-react";
import CompanyModal from "./CompanyModal";

export default function AddCompanyModal({ open, onClose, onAdd, onAddTaskType, onDeleteTaskType, onRenameTaskType }) {
  const handleSubmit = payload => {
    onAdd(payload);
    onClose();
  };

  return (
    <CompanyModal
      open={open}
      onClose={onClose}
      onSubmit={handleSubmit}
      onAddTaskType={onAddTaskType}
      onDeleteTaskType={onDeleteTaskType}
      onRenameTaskType={onRenameTaskType}
      title="เพิ่มบริษัทใหม่"
      submitLabel={
        <>
          <Plus size={16} /> เพิ่มบริษัท
        </>
      }
    />
  );
}
