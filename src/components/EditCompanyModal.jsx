import { useMemo } from "react";
import { Save } from "lucide-react";
import CompanyModal from "./CompanyModal";
import { useTaskTypes } from "../lib/TaskTypesContext";

export default function EditCompanyModal({ open, onClose, company, onSave, onAddTaskType, onDeleteTaskType, onRenameTaskType }) {
  const taskTypes = useTaskTypes();
  const initial = useMemo(() => {
    if (!company) return null;
    const standardTypes = company.services.filter(cs => taskTypes[cs.type]).map(cs => cs.type);
    const customServices = company.services.filter(cs => !taskTypes[cs.type]);

    return {
      name: company.name,
      short: company.short,
      owner: company.owner,
      services: Object.fromEntries(standardTypes.map(t => [t, true])),
      otherEnabled: customServices.length > 0,
      otherText: customServices.map(cs => cs.type).join(", "),
      otherDueDay: customServices[0] ? customServices[0].customDueDay : 20,
    };
  }, [company, taskTypes]);

  if (!company) return null;

  const handleSubmit = payload => {
    onSave(company, payload);
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
      title={`แก้ไข ${company.short}`}
      submitLabel={
        <>
          <Save size={16} /> บันทึก
        </>
      }
      initial={initial}
    />
  );
}
