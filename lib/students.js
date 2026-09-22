const supabase = require('./db');

async function createStudent({ studentId, firstName, lastName, email, role }) {
  const { data, error } = await supabase
    .from('students')
    .insert([{ student_id: studentId, first_name: firstName, last_name: lastName, email }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function getStudent(studentId) {
  const { data, error } = await supabase
    .from('students')
    .select('*')
    .eq('student_id', studentId)
    .single();
  if (error) throw error;
  return data;
}

async function listStudents() {
  const { data, error } = await supabase.from('students').select('*');
  if (error) throw error;
  return data;
}

async function updateStudent(studentId, updates) {
  const { data, error } = await supabase
    .from('students')
    .update(updates)
    .eq('student_id', studentId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function deleteStudent(studentId) {
  const { error } = await supabase.from('students').delete().eq('student_id', studentId);
  if (error) throw error;
  return true;
}

module.exports = { createStudent, getStudent, listStudents, updateStudent, deleteStudent };